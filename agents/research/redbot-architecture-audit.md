# Red-DiscordBot Architecture Audit
## Deep Technical Analysis for Lumi v2 Overhaul

**Repository**: `.lumi-agents/research/repos/redbot`
**Date**: 2026-11-14

---

## Executive Summary

Red-DiscordBot (Red v3) is a mature, production-grade Discord bot framework with a sophisticated architecture that solves many problems Lumi v2 currently faces. Its key innovations include: a **multi-backend config driver abstraction** supporting JSON/PostgreSQL with 7 config scopes, **weakref-based singleton caching** with automatic cleanup, a **state-machine permission system** with rule priorities, **event-driven config change propagation**, and a **portable data path manager** for multi-instance deployments.

This document provides concrete patterns, code references, and actionable recommendations for Lumi v2.

---

## 1. Config Driver Abstraction (7 Scopes)

### 1.1 Architecture Overview

**Files**:
- `redbot/core/config.py` - Main Config API (1546 lines)
- `redbot/core/_drivers/base.py` - Abstract BaseDriver (396 lines)
- `redbot/core/_drivers/json.py` - JSON file backend (263 lines)
- `redbot/core/_drivers/postgres/postgres.py` - PostgreSQL backend (228 lines)
- `redbot/core/_drivers/__init__.py` - Driver factory

### 1.2 The 7 Config Scopes

Defined in `config.py:630-635`:

```python
class Config(metaclass=ConfigMeta):
    GLOBAL = "GLOBAL"      # Bot-wide settings
    GUILD = "GUILD"        # Per-guild settings
    CHANNEL = "TEXTCHANNEL" # Per-channel (text/voice/thread)
    ROLE = "ROLE"          # Per-role settings
    USER = "USER"          # Per-user (guild-independent)
    MEMBER = "MEMBER"      # Per-member (guild-dependent: guild_id + user_id)
    # CUSTOM = dynamic     # Arbitrary composite keys via init_custom()
```

### 1.3 Scope Registration API

Each scope has a dedicated registration method (`config.py:819-1170`):

```python
config.register_global(**kwargs)     # Global
config.register_guild(**kwargs)      # Guild
config.register_channel(**kwargs)    # Channel
config.register_role(**kwargs)       # Role
config.register_user(**kwargs)       # User (cross-guild)
config.register_member(**kwargs)     # Member (guild-scoped)
config.register_custom(group, **kwargs)  # Custom composite keys
config.init_custom(group, identifier_count)  # Initialize custom group
```

### 1.4 Scope Access Patterns

```python
# Global: direct attribute access
await config.foo.set(True)
value = await config.foo()

# Scoped: method chaining
await config.guild(guild).foo.set(True)
await config.channel(channel).foo.set(True)
await config.role(role).foo.set(True)
await config.user(user).foo.set(True)           # Cross-guild
await config.member(member).foo.set(True)       # Guild-scoped
await config.custom("mygroup", "key1", "key2")  # Custom composite
```

### 1.5 Driver Abstraction Layer

**BaseDriver** (`_drivers/base.py:165-253`) defines the interface:

```python
class BaseDriver(abc.ABC):
    async def get(self, identifier_data: IdentifierData) -> Any
    async def set(self, identifier_data: IdentifierData, value=None) -> None
    async def clear(self, identifier_data: IdentifierData) -> None
    @classmethod
    async def initialize(cls, **storage_details) -> None
    @classmethod
    async def teardown(cls) -> None
    @classmethod
    async def aiter_cogs(cls) -> AsyncIterator[Tuple[str, str]]
    @classmethod
    async def migrate_to(cls, new_driver_cls, all_custom_group_data) -> None
```

**IdentifierData** (`base.py:58-162`) encodes scope hierarchy:
```python
IdentifierData(
    cog_name: str,
    uuid: str,
    category: ConfigCategory,  # GLOBAL, GUILD, CHANNEL, ROLE, USER, MEMBER, or custom
    primary_key: Tuple[str, ...],  # e.g., ("123456",) for guild, ("123456", "789012") for member
    identifiers: Tuple[str, ...],  # nested keys like ("foo", "bar")
    primary_key_len: int,
    is_custom: bool
)
```

### 1.6 JSON Driver Implementation

**File**: `_drivers/json.py`

Key features:
- **In-memory shared datastore** with weakref finalizers (`_shared_datastore`, `_driver_counts`)
- **Atomic writes** via temp file + `os.fsync()` + `replace()` (`_save_json()` at line 224)
- **Per-cog locking** via `asyncio.Lock` in `_locks` dict
- **Deep copy via pickle** for isolation on reads (`pickle.loads(pickle.dumps(partial, -1))`)

### 1.7 PostgreSQL Driver Implementation

**File**: `_drivers/postgres/postgres.py`

Key features:
- **Connection pooling** via `asyncpg.Pool` (class-level `_pool`)
- **Schema management** via `ddl.sql` / `drop_ddl.sql`
- **Identifier encoding** to SQL parameters (`encode_identifier_data()`)
- **Async iteration** over stored cogs via `aiter_cogs()`

### 1.8 Driver Factory

**File**: `_drivers/__init__.py` - `get_driver(cog_name, identifier, **kwargs)` selects driver based on `storage_details()["TYPE"]` ("JSON" or "POSTGRES").

---

## 2. Weakref-Based Singleton Cache with Automatic Cleanup

### 2.1 Config Singleton via Metaclass

**File**: `config.py:37-64`

```python
_config_cache = weakref.WeakValueDictionary()

class ConfigMeta(type):
    def __call__(cls, cog_name, unique_identifier, driver, force_registration=False, defaults=None):
        key = (cog_name, unique_identifier)
        if key in _config_cache:
            return _config_cache[key]
        instance = super().__call__(...)
        _config_cache[key] = instance
        return instance
```

**Behavior**: Multiple `Config.get_conf()` calls with same cog+identifier return **same instance**. When cog unloads and no references remain, weakref allows GC cleanup.

### 2.2 Per-Value Lock Cache

**File**: `config.py:653-655, 141-172, 1523`

```python
self._lock_cache: MutableMapping[IdentifierData, asyncio.Lock] = weakref.WeakValueDictionary()

def get_lock(self) -> asyncio.Lock:
    return self._lock_cache.setdefault(self.identifier_data, asyncio.Lock())
```

**Critical pattern** (docstring at line 143-164):
```python
# CORRECT - keep reference
lock = config.foo.get_lock()
await lock.acquire()
try:
    # critical section
finally:
    lock.release()

# WRONG - lock GC'd before release
await config.foo.get_lock().acquire()  # Different lock on release!
config.foo.get_lock().release()
```

### 2.3 JSON Driver Shared Datastore Cleanup

**File**: `_drivers/json.py:18-41`

```python
_shared_datastore = {}
_driver_counts = {}
_finalizers = []

def finalize_driver(cog_name):
    _driver_counts[cog_name] -= 1
    if _driver_counts[cog_name] == 0:
        if cog_name in _shared_datastore:
            del _shared_datastore[cog_name]
        if cog_name in _locks:
            del _locks[cog_name]
    # Clean dead finalizers
    for f in _finalizers:
        if not f.alive:
            _finalizers.remove(f)

# In __init__:
_finalizers.append(weakref.finalize(self, finalize_driver, self.cog_name))
```

**Pattern**: Reference counting + weakref finalizers = automatic memory cleanup when last driver instance dies.

---

## 3. Cog Load/Unload/Reload with Dependency Resolution

### 3.1 Cog Manager

**File**: `redbot/core/_cog_manager.py`

**CogManager** (`line 36-331`) handles:
- Multi-path cog discovery (install path > temp paths > user paths > core path)
- `find_cog(name)` → tries external then core cogs
- `available_modules()` → lists all loadable modules
- `invalidate_caches()` → `importlib.invalidate_caches()`

### 3.2 Bot Extension Loading

**File**: `bot.py:1772-1791`

```python
async def load_extension(self, spec: ModuleSpec):
    name = spec.name.split(".")[-1]
    if name in self.extensions:
        raise errors.PackageAlreadyLoaded(spec)

    lib = spec.loader.load_module()
    if not hasattr(lib, "setup"):
        del lib
        raise discord.ClientException(f"extension {name} does not have a setup function")

    try:
        await lib.setup(self)  # Cog's async setup()
        await self.tree.red_check_enabled()
    except Exception as e:
        await self._remove_module_references(lib.__name__)
        await self._call_module_finalizers(lib, name)
        raise
    else:
        self._BotBase__extensions[name] = lib
```

**Key**: Bypasses discord.py's `_load_from_module_spec`, calls `lib.setup(bot)` directly, handles cleanup on failure.

### 3.3 Cog Add/Remove with Events

**File**: `bot.py:2047-2086`

```python
async def add_cog(self, cog, /, *, guild=MISSING, guilds=MISSING):
    cog_name = cog.__cog_name__
    if cog_name in self.cogs:
        raise discord.ClientException(f"Cog named {cog_name!r} already loaded")
    await self.remove_cog(cog_name, guild=guild, guilds=guilds)  # Hot-reload support

    if not hasattr(cog, "requires"):
        commands.Cog.__init__(cog)  # Initialize Requires if missing

    await super().add_cog(cog, guild=guild, guilds=guilds)
    self.dispatch("cog_add", cog)  # Event for permissions cog

async def remove_cog(self, cogname, /, *, guild=MISSING, guilds=MISSING):
    cog = self.get_cog(cogname)
    if cog is None:
        return

    # Remove permissions hooks
    for cls in inspect.getmro(cog.__class__):
        hook = getattr(cog, f"_{cls.__name__}__permissions_hook", None)
        if hook:
            self.remove_permissions_hook(hook)

    await super().remove_cog(cogname, guild=guild, guilds=guilds)
    self.dispatch("cog_remove", cog)  # Event for permissions cog

    cog.requires.reset()  # Clear permission rules
    for meth in self.rpc_handlers.pop(cogname.upper(), ()):
        self.unregister_rpc_handler(meth)
    return cog
```

### 3.4 Startup Package Loading with Dependency Ordering

**File**: `bot.py:1313-1346`

```python
packages = OrderedDict()  # Preserves insertion order

# Load permissions FIRST for security
try:
    packages.move_to_end("permissions", last=False)
except KeyError:
    pass

for package in packages:
    spec = await self._cog_mgr.find_cog(package)
    if spec is None:
        await self.remove_loaded_package(package)
        continue
    await asyncio.wait_for(self.load_extension(spec), 30)
```

**Pattern**: `OrderedDict` + `move_to_end(..., last=False)` forces permissions cog to load first. No formal dependency graph—manual ordering.

---

## 4. Permissions as State Machine with Rule Priorities

### 4.1 Permission States (State Machine)

**File**: `commands/requires.py:146-202`

```python
class PermState(enum.Enum):
    ACTIVE_ALLOW      = auto()  # Explicitly allowed, ignore defaults
    NORMAL            = auto()  # No overrides, use default checks
    PASSIVE_ALLOW     = auto()  # Subcommand allowed, continue down tree
    CAUTIOUS_ALLOW    = auto()  # Denied but subcommand allowed
    ACTIVE_DENY       = auto()  # Explicitly denied, terminate chain
    ALLOWED_BY_HOOK   = auto()  # Allowed by hook (→ PASSIVE_ALLOW for subs)
    DENIED_BY_HOOK    = auto()  # Denied by hook (→ ACTIVE_DENY for subs)
```

### 4.2 State Transitions

**File**: `commands/requires.py:219-255`

```python
PermStateTransitions: TransitionDict = {
    PermState.ACTIVE_ALLOW: {
        ACTIVE_ALLOW: (True, ACTIVE_ALLOW),
        NORMAL:       (True, ACTIVE_ALLOW),
        PASSIVE_ALLOW: (True, ACTIVE_ALLOW),
        CAUTIOUS_ALLOW: (True, CAUTIOUS_ALLOW),
        ACTIVE_DENY:  (False, ACTIVE_DENY),
    },
    PermState.NORMAL: {
        ACTIVE_ALLOW: (True, ACTIVE_ALLOW),
        NORMAL:       (None, NORMAL),      # None = use default checks
        PASSIVE_ALLOW: (True, {True: NORMAL, False: PASSIVE_ALLOW}),  # Dynamic!
        CAUTIOUS_ALLOW: (True, CAUTIOUS_ALLOW),
        ACTIVE_DENY:  (False, ACTIVE_DENY),
    },
    # ... more transitions
}
```

**TransitionResult** = `Tuple[Optional[bool], Union[PermState, Dict[bool, PermState]]]`
- `bool` = should invoke command? `None` = run default checks
- Next state can be dynamic (dict mapping check result → state)

### 4.3 Rule Priority Resolution

**File**: `commands/requires.py:572-613` - `_get_rule_from_ctx()`

```python
def _get_rule_from_ctx(self, ctx) -> PermState:
    # 1. Build model chain (priority order):
    #    User → Voice Channel → Channel/Thread → Parent Category → Roles (highest first) → Guild
    model_chain = [author, *channels, *reversed(author.roles[1:]), guild]

    # 2. Check global rules first, then guild rules
    rules_chain = [self._global_rules]
    if guild_rules := self._guild_rules.get(ctx.guild.id):
        rules_chain.append(guild_rules)

    # 3. First match wins (highest priority)
    for rules in rules_chain:
        for model in model_chain:
            if rule := rules.get(model.id):
                return rule

    # 4. Fallback to default rule
    default = self.get_rule(self.DEFAULT, guild.id)
    if default is NORMAL:
        default = self.get_rule(self.DEFAULT, GLOBAL)
    return default
```

**Priority Order** (per docs at line 221-228):
1. User-specific rules
2. Voice/stage channel rules
3. Channel/thread/parent category rules
4. Role rules (highest role wins)
5. Guild rules (global scope only)
6. Default rule

### 4.4 Requires Class - Rule Storage

**File**: `commands/requires.py:344-345`

```python
self._global_rules: _RulesDict = _RulesDict()  # {model_id: PermState}
self._guild_rules: _IntKeyDict[_RulesDict] = _IntKeyDict()  # {guild_id: {model_id: PermState}}
```

### 4.5 Verification Flow

**File**: `commands/requires.py:468-570`

```python
async def verify(self, ctx) -> bool:
    await self.ready_event.wait()  # Wait for rules load
    await self._verify_bot(ctx)    # Bot permissions (non-overrideable)

    if await ctx.bot.is_owner(ctx.author):
        return True  # Owner bypass

    hook_result = await ctx.bot.verify_permissions_hooks(ctx)
    if hook_result is not None:
        return hook_result  # Hook override

    return await self._transition_state(ctx)

async def _transition_state(self, ctx):
    should_invoke, next_state = self._get_transitioned_state(ctx)
    if should_invoke is None:
        should_invoke = await self._verify_user(ctx)  # Default checks
    elif isinstance(next_state, dict):  # NORMAL → PASSIVE_ALLOW dynamic
        would_invoke = self._get_would_invoke(ctx) or await self._verify_user(ctx)
        next_state = next_state[would_invoke]

    ctx.permission_state = next_state
    return should_invoke
```

---

## 5. DataManager for Portable Data Paths

### 5.1 Platform-Aware Path Resolution

**File**: `data_manager.py:39-52`

```python
appdir = platformdirs.PlatformDirs("Red-DiscordBot")
config_dir = appdir.user_config_path

# System user (UID 1-999) detection for container/service deployments
_system_user = sys.platform == "linux" and 0 < os.getuid() < 1000
if _system_user:
    if Path.home().exists():
        config_dir = Path.home() / ".config" / "Red-DiscordBot"
    else:
        config_dir = appdir.site_data_path
```

### 5.2 Instance Isolation

**File**: `data_manager.py:95-136`

```python
def load_basic_configuration(instance_name_: str):
    # Creates instance-specific config.json
    # Stores: DATA_PATH, STORAGE_TYPE, STORAGE_DETAILS
    # Supports multiple bot instances on same machine

def _base_data_path() -> Path:
    # Reads DATA_PATH from instance config
    return Path(path).resolve()
```

### 5.3 Path Accessors

**File**: `data_manager.py:139-235`

```python
def cog_data_path(cog_instance=None, raw_name: str = None) -> Path:
    # Returns: <data_path>/cogs/<cog_name>/
    # Creates directory if needed

def core_data_path() -> Path:
    # Returns: <data_path>/core/

def bundled_data_path(cog_instance) -> Path:
    # Returns: <cog_package_path>/data/  (read-only assets)

def data_path() -> Path:
    # Returns base data directory

def instance_name() -> str:
    # Returns current instance name

def storage_type() -> str:
    # Returns "JSON" or "POSTGRES"

def storage_details() -> Dict[str, str]:
    # Returns driver-specific config (host, port, db, user, password for Postgres)
```

---

## 6. Event-Driven Config Change Propagation

### 6.1 Bot Event Dispatch

**File**: `bot.py` - Key dispatches:
- `cog_add` / `cog_remove` (lines 1814, 2084)
- `command_add` (lines 2107-2112)
- `red_api_tokens_update` (lines 1662, 1684, 1706)

### 6.2 Permissions Cog - Reactive Rule Loading

**File**: `cogs/permissions/permissions.py:538-572`

```python
@commands.Cog.listener()
async def on_cog_add(self, cog):
    if cog is self: return
    await self._on_cog_add(cog)

@commands.Cog.listener()
async def on_command_add(self, command):
    if command.cog is self: return
    await self._on_command_add(command)

async def _on_cog_add(self, cog):
    self._load_rules_for(
        cog_or_command=cog,
        rule_dict=await self.config.custom(COG, cog.__class__.__name__).all(),
    )
    cog.requires.ready_event.set()  # Unblock verify()

async def _on_command_add(self, command):
    self._load_rules_for(
        cog_or_command=command,
        rule_dict=await self.config.custom(COMMAND, command.qualified_name).all(),
    )
    command.requires.ready_event.set()
```

**Pattern**: Event listeners → load rules from config → set `ready_event` → commands can now verify.

### 6.3 Rule Mutation → Config Sync

**File**: `cogs/permissions/permissions.py:574-603`

```python
async def _add_rule(self, rule, cog_or_cmd, model_id, guild_id):
    # 1. Update in-memory Requires object
    if rule:
        cog_or_cmd.obj.allow_for(model_id, guild_id=guild_id)
    else:
        cog_or_cmd.obj.deny_to(model_id, guild_id=guild_id)

    # 2. Persist to config (async context manager = atomic)
    async with self.config.custom(cog_or_cmd.type, cog_or_cmd.name).all() as rules:
        rules.setdefault(str(guild_id), {})[str(model_id)] = rule

async def _remove_rule(self, cog_or_cmd, model_id, guild_id):
    cog_or_cmd.obj.clear_rule_for(model_id, guild_id=guild_id)
    async with self.config.custom(cog_or_cmd.type, cog_or_cmd.name).all() as rules:
        rules.get(str(guild_id), {}).pop(str(model_id), None)
```

### 6.4 YAML Bulk Update → Cascade

**File**: `cogs/permissions/permissions.py:661-683`

```python
async def _yaml_set_acl(self, source, guild_id, update):
    if not update:
        await self._clear_rules(guild_id)

    for category, getter in ((COG, self.bot.get_cog), (COMMAND, self.bot.get_command)):
        for cmd_name, cmd_rules in rules_dict.items():
            await conf.set_raw(cmd_name, str(guild_id), value=cmd_rules)
            cmd_obj = getter(str(cmd_name))
            if cmd_obj:
                self._load_rules_for(cmd_obj, {guild_id: cmd_rules})  # Immediate hot-reload
```

---

## 7. Key Architectural Patterns for Lumi v2 Adoption

### 7.1 Config Abstraction Pattern

| Red Pattern | Lumi v2 Application |
|-------------|---------------------|
| `Config.get_conf(cog, id)` singleton | Replace `Config` class with driver-agnostic version |
| 7 scopes (global→custom) | Adopt for guild/channel/user/role/member parity |
| `register_*` + `force_registration` | Add schema validation + typo protection |
| Weakref cache + lock cache | Implement for Lumi's config objects |

### 7.2 Driver Abstraction

| Red Pattern | Lumi v2 Application |
|-------------|---------------------|
| `BaseDriver` ABC with get/set/clear | Define `ConfigDriver` protocol |
| JSON (atomic fsync) + Postgres (pool) | Support SQLite/Postgres/Redis backends |
| `migrate_to()` for backend switching | Implement config migration tooling |
| `IdentifierData` for scope encoding | Adopt for consistent key structure |

### 7.3 Cog Lifecycle

| Red Pattern | Lumi v2 Application |
|-------------|---------------------|
| `load_extension(spec)` → `lib.setup(bot)` | Standardize addon `setup(bot)` async init |
| `cog_add`/`cog_remove` events | Emit for dashboard sync, permissions |
| `OrderedDict` + `move_to_end` for load order | Add dependency graph for addons |
| `remove_cog` cleans hooks/RPC | Ensure Lumi addon teardown does same |

### 7.4 Permissions State Machine

| Red Pattern | Lumi v2 Application |
|-------------|---------------------|
| 7 `PermState` values | Replace bool allow/deny with state machine |
| Transition table (`PermStateTransitions`) | Formalize priority resolution |
| Model chain (user→channel→roles→guild) | Adopt for Discord hierarchy |
| `ready_event` for async rule load | Block command invocation until rules ready |

### 7.5 Data Path Management

| Red Pattern | Lumi v2 Application |
|-------------|---------------------|
| `platformdirs` for cross-platform paths | Replace hardcoded paths |
| Instance isolation via config.json | Support multi-tenant Lumi |
| `cog_data_path()` / `bundled_data_path()` | Standardize addon data locations |
| `storage_details()` for driver config | Centralize DB connection config |

### 7.6 Event Propagation

| Red Pattern | Lumi v2 Application |
|-------------|---------------------|
| `bot.dispatch("cog_add", cog)` | Emit for dashboard real-time updates |
| Listener → load config → `ready_event.set()` | Pattern for async initialization |
| Config context manager (`async with config.all()`) | Atomic bulk updates |

---

## 8. Concrete Code References for Implementation

### 8.1 Config Driver Interface (Lumi v2)

```python
# lumi/core/config/drivers/base.py
from abc import ABC, abstractmethod
from typing import Any, AsyncIterator, Tuple
from dataclasses import dataclass

@dataclass
class ConfigKey:
    addon: str
    scope: str  # GLOBAL, GUILD, CHANNEL, USER, ROLE, MEMBER, CUSTOM
    primary_keys: Tuple[str, ...]  # e.g., ("123456",) or ("123456", "789012")
    path: Tuple[str, ...]  # nested keys like ("settings", "prefix")

class ConfigDriver(ABC):
    @abstractmethod
    async def get(self, key: ConfigKey) -> Any: ...
    @abstractmethod
    async def set(self, key: ConfigKey, value: Any) -> None: ...
    @abstractmethod
    async def delete(self, key: ConfigKey) -> None: ...
    @abstractmethod
    async def list_keys(self, prefix: ConfigKey) -> AsyncIterator[ConfigKey]: ...
    @classmethod
    @abstractmethod
    async def initialize(cls, **config) -> None: ...
    @classmethod
    @abstractmethod
    async def shutdown(cls) -> None: ...
```

### 8.2 Weakref Singleton Cache (Lumi v2)

```python
# lumi/core/config/manager.py
import weakref
import asyncio
from typing import TypeVar, Generic

_T = TypeVar("_T")
_config_cache: weakref.WeakValueDictionary[tuple, "Config"] = weakref.WeakValueDictionary()
_lock_cache: weakref.WeakValueDictionary[ConfigKey, asyncio.Lock] = weakref.WeakValueDictionary()

class ConfigMeta(type):
    def __call__(cls, addon: str, identifier: str, driver: ConfigDriver, **kwargs):
        key = (addon, identifier)
        if key in _config_cache:
            return _config_cache[key]
        instance = super().__call__(addon, identifier, driver, **kwargs)
        _config_cache[key] = instance
        return instance

class Config(metaclass=ConfigMeta):
    def __init__(self, addon: str, identifier: str, driver: ConfigDriver):
        self.addon = addon
        self.identifier = identifier
        self._driver = driver
        self._defaults = {}

    def get_lock(self, key: ConfigKey) -> asyncio.Lock:
        return _lock_cache.setdefault(key, asyncio.Lock())
```

### 8.3 Permission State Machine (Lumi v2)

```python
# lumi/core/permissions/state.py
from enum import Enum, auto
from typing import Dict, Tuple, Optional, Union

class PermState(Enum):
    ACTIVE_ALLOW = auto()
    NORMAL = auto()
    PASSIVE_ALLOW = auto()
    CAUTIOUS_ALLOW = auto()
    ACTIVE_DENY = auto()
    ALLOWED_BY_HOOK = auto()
    DENIED_BY_HOOK = auto()

TransitionResult = Tuple[Optional[bool], Union[PermState, Dict[bool, PermState]]]

TRANSITIONS: Dict[PermState, Dict[PermState, TransitionResult]] = {
    PermState.ACTIVE_ALLOW: {
        PermState.ACTIVE_ALLOW: (True, PermState.ACTIVE_ALLOW),
        PermState.NORMAL: (True, PermState.ACTIVE_ALLOW),
        PermState.PASSIVE_ALLOW: (True, PermState.ACTIVE_ALLOW),
        PermState.CAUTIOUS_ALLOW: (True, PermState.CAUTIOUS_ALLOW),
        PermState.ACTIVE_DENY: (False, PermState.ACTIVE_DENY),
    },
    PermState.NORMAL: {
        PermState.ACTIVE_ALLOW: (True, PermState.ACTIVE_ALLOW),
        PermState.NORMAL: (None, PermState.NORMAL),
        PermState.PASSIVE_ALLOW: (True, {True: PermState.NORMAL, False: PermState.PASSIVE_ALLOW}),
        PermState.CAUTIOUS_ALLOW: (True, PermState.CAUTIOUS_ALLOW),
        PermState.ACTIVE_DENY: (False, PermState.ACTIVE_DENY),
    },
    # ... complete from Red
}

def transition(prev: PermState, next_state: PermState) -> TransitionResult:
    if prev is PermState.ALLOWED_BY_HOOK:
        prev = PermState.PASSIVE_ALLOW
    elif prev is PermState.DENIED_BY_HOOK:
        prev = PermState.ACTIVE_DENY
    return TRANSITIONS[prev][next_state]
```

### 8.4 Data Path Manager (Lumi v2)

```python
# lumi/core/paths.py
import platformdirs
from pathlib import Path
import json

class PathManager:
    def __init__(self, instance_name: str = "default"):
        self.instance_name = instance_name
        self.appdir = platformdirs.PlatformDirs("Lumi")
        self._config_path = self.appdir.user_config_path / f"{instance_name}.json"
        self._load_config()

    def _load_config(self):
        if self._config_path.exists():
            with open(self._config_path) as f:
                self._config = json.load(f)
        else:
            self._config = {"DATA_PATH": str(self.appdir.user_data_path / instance_name)}

    @property
    def data_path(self) -> Path:
        return Path(self._config["DATA_PATH"]).resolve()

    def addon_data_path(self, addon_name: str) -> Path:
        path = self.data_path / "addons" / addon_name
        path.mkdir(parents=True, exist_ok=True)
        return path

    def core_data_path(self) -> Path:
        path = self.data_path / "core"
        path.mkdir(parents=True, exist_ok=True)
        return path
```

---

## 9. Recommendations for Lumi v2

### Priority 1: Config System Overhaul
1. **Implement driver abstraction** - Replace direct JSON/file access with `ConfigDriver` protocol
2. **Add 7 scopes** - Global, Guild, Channel, User, Role, Member, Custom
3. **Weakref singleton cache** - Prevent duplicate Config instances, auto-cleanup
4. **Per-key locking** - WeakValueDictionary for lock cache (critical for correctness)

### Priority 2: Permission State Machine
1. **Replace bool allow/deny** with 7-state `PermState` enum
2. **Implement transition table** for deterministic priority resolution
3. **Model chain evaluation** (user → channel → roles → guild)
4. **Ready event pattern** - Block commands until rules loaded

### Priority 3: Addon Lifecycle
1. **Standardize `async def setup(bot)`** for addon initialization
2. **Emit `addon_load`/`addon_unload` events** for dashboard/permissions sync
3. **Dependency graph** for load ordering (replace manual `move_to_end`)
4. **Cleanup hooks/RPC handlers** on unload

### Priority 4: Data Path Management
1. **Use `platformdirs`** for cross-platform config/data paths
2. **Instance isolation** via instance-named config files
3. **Addon data paths** under `<data>/addons/<name>/`
4. **Bundled assets** via `importlib.resources` read-only access

### Priority 5: Event-Driven Architecture
1. **Central event bus** on bot for `addon_add`, `config_change`, `permission_change`
2. **Config context managers** for atomic bulk updates
3. **Dashboard RPC** subscribes to config change events for real-time UI

---

## 10. File Reference Index

| Component | Red File | Lines | Purpose |
|-----------|----------|-------|---------|
| Config API | `redbot/core/config.py` | 1-1546 | Main entry point, 7 scopes, singleton |
| Config Meta | `config.py` | 37-64 | Weakref singleton via metaclass |
| Value/Group | `config.py` | 120-595 | Composite pattern, context managers |
| Scope Access | `config.py` | 949-1170 | `guild()`, `channel()`, `member()`, `custom()` |
| Lock Cache | `config.py` | 141-172, 1523 | Weakref lock cache pattern |
| BaseDriver | `_drivers/base.py` | 165-253 | Abstract driver interface |
| JSON Driver | `_drivers/json.py` | 44-263 | Atomic fsync, shared datastore, finalizers |
| Postgres Driver | `_drivers/postgres/postgres.py` | 38-228 | Connection pool, schema, migration |
| Data Manager | `data_manager.py` | 39-284 | Platform paths, instance isolation |
| Cog Manager | `_cog_manager.py` | 36-331 | Multi-path discovery, invalidation |
| Bot Load | `bot.py` | 1772-1791 | `load_extension` with setup() |
| Cog Events | `bot.py` | 1793-1821, 2047-2086 | add/remove with dispatch |
| Startup Order | `bot.py` | 1313-1346 | OrderedDict + permissions first |
| Perm States | `commands/requires.py` | 146-202 | 7-state enum |
| Transitions | `commands/requires.py` | 219-255 | Transition table |
| Rule Priority | `commands/requires.py` | 572-613 | Model chain resolution |
| Verify Flow | `commands/requires.py` | 468-570 | Hook → transition → defaults |
| Perm Cog | `cogs/permissions/permissions.py` | 538-683 | Event listeners, rule sync, YAML |

---

## Conclusion

Red-DiscordBot's architecture demonstrates **battle-tested patterns** for:
- **Multi-backend configuration** with scope hierarchy
- **Memory-safe caching** via weakrefs + finalizers
- **Deterministic permissions** via state machine + priority chain
- **Hot-reloadable addons** with event-driven rule propagation
- **Portable deployments** via platform-aware path management

Lumi v2 should adopt these patterns wholesale rather than reinventing. The config driver abstraction alone would solve Lumi's current JSON-only limitation and enable PostgreSQL for multi-instance deployments. The permission state machine replaces ad-hoc allow/deny logic with a formally verifiable system. The weakref caching eliminates memory leaks in long-running bot processes.