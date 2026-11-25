# Red-DiscordBot Deep Architectural Analysis

**Repository**: `/home/rebiz/opt/workdir/.lumi-agents/research/repos/redbot`
**Analysis Date**: 2026-11-14

---

## 1. Configuration System (`redbot/core/config.py`)

### 1.1 Core Architecture

The Config system is the central configuration management layer for Red-DiscordBot. It provides:

- **Singleton pattern** via `ConfigMeta` metaclass using `weakref.WeakValueDictionary` for automatic cleanup
- **Driver abstraction** supporting JSON, PostgreSQL, and legacy MongoDB backends
- **Scope isolation** with 7 built-in categories + custom groups
- **Default value registration** with nested path support (`__` separator)

```python
# Singleton cache (weakref for GC safety)
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

### 1.2 Scope Categories (Isolation Model)

| Category | Constant | Primary Keys | Use Case |
|----------|----------|--------------|----------|
| Global | `GLOBAL` | 0 | Bot-wide settings |
| Guild | `GUILD` | 1 (guild_id) | Per-server settings |
| Channel | `CHANNEL`/`TEXTCHANNEL` | 1 (channel_id) | Per-channel settings |
| Role | `ROLE` | 1 (role_id) | Per-role settings |
| User | `USER` | 1 (user_id) | Cross-guild user data |
| Member | `MEMBER` | 2 (guild_id, user_id) | Guild-specific user data |
| Custom | `CUSTOM_GROUPS` | N (configurable) | Arbitrary composite keys |

```python
# ConfigCategory enum (core/_drivers/base.py)
class ConfigCategory(str, enum.Enum):
    GLOBAL = "GLOBAL"
    GUILD = "GUILD"
    CHANNEL = "TEXTCHANNEL"
    ROLE = "ROLE"
    USER = "USER"
    MEMBER = "MEMBER"
```

### 1.3 Default Registration API

```python
# Simple values
config.register_global(foo=True, bar=False)

# Nested via dict
config.register_global(**{"foo": {"bar": True, "baz": False}})

# Nested via double underscore
config.register_global(foo__bar=True, foo__baz=False)

# Scope-specific
config.register_guild(**kwargs)
config.register_channel(**kwargs)
config.register_role(**kwargs)
config.register_user(**kwargs)      # guild-independent
config.register_member(**kwargs)    # guild-dependent
config.register_custom("group_name", **kwargs)
config.init_custom("group_name", identifier_count=2)  # required first!
```

### 1.4 Value Access Patterns

```python
# Get group for scope
group = config.guild(guild_obj)           # Group object
group = config.guild_from_id(guild_id)    # Group object (no API call)
group = config.channel(channel_obj)
group = config.user(user_obj)
group = config.member(member_obj)         # guild + user
group = config.member_from_ids(guild_id, user_id)

# Access values (returns _ValueCtxManager awaitable)
value = await group.setting_name()              # with default
value = await group.setting_name(default=42)    # override default

# Mutable context manager (dict/list only)
async with group.settings_dict() as d:
    d["key"] = "value"  # auto-saved on exit

# Raw access (bypasses defaults)
raw = await group.get_raw("nested", "path")
await group.set_raw("nested", "path", value)
await group.clear_raw("nested", "path")
```

### 1.5 Driver Interface (`core/_drivers/base.py`)

```python
class BaseDriver(abc.ABC):
    def __init__(self, cog_name: str, identifier: str, **kwargs):
        self.cog_name = cog_name
        self.unique_cog_identifier = identifier
    
    @abc.abstractmethod
    async def get(self, identifier_data: IdentifierData) -> Any: ...
    
    @abc.abstractmethod
    async def set(self, identifier_data: IdentifierData, value=None): ...
    
    @abc.abstractmethod
    async def clear(self, identifier_data: IdentifierData): ...
    
    # Atomic operations
    async def inc(self, identifier_data, value, default): ...
    async def toggle(self, identifier_data, default): ...
    
    # Migration/bulk
    @classmethod
    @abc.abstractmethod
    async def initialize(cls, **storage_details): ...
    @classmethod
    @abc.abstractmethod
    async def teardown(cls): ...
    @classmethod
    @abc.abstractmethod
    async def aiter_cogs(cls) -> AsyncIterator[Tuple[str, str]]: ...
    @classmethod
    @abc.abstractmethod
    async def delete_all_data(cls, *, drop_db=None, **kwargs): ...
    @classmethod
    @abc.abstractmethod
    async def export_data(cls, ...) -> List[Tuple[str, Dict]]: ...
    @classmethod
    @abc.abstractmethod
    async def import_data(cls, ...): ...
```

#### IdentifierData Structure
```python
@dataclass
class IdentifierData:
    cog_name: str
    uuid: str              # unique_identifier
    category: str          # ConfigCategory value
    primary_key: Tuple[str, ...]
    identifiers: Tuple[str, ...]  # nested path
    primary_key_len: int
    is_custom: bool
    
    def get_child(self, *nested_path) -> "IdentifierData": ...
```

### 1.6 JSON Driver (`core/_drivers/json.py`)

- **In-memory cache** with `weakref` finalizers for auto-save
- **Atomic writes** via temp file + `os.fsync` + atomic rename
- **Per-cog file** at `data/cog_name/identifier.json`
- **Shared datastore** across Config instances for same cog

```python
_shared_datastore = {}  # cog_name -> {data, dirty_flag}
_driver_counts = {}     # reference counting
_locks = defaultdict(asyncio.Lock)  # per-cog locks

# Save debounced via finalizer
def _save_json(path, data):
    tmp_path = path.parent / f"{path.stem}-{uuid4().fields[0]}.tmp"
    with tmp_path.open("w") as f:
        json.dump(data, f)
        f.flush()
        os.fsync(f.fileno())
    tmp_path.replace(path)
    # fsync directory for durability
```

### 1.7 PostgreSQL Driver (`core/_drivers/postgres/postgres.py`)

- **Connection pool** via `asyncpg`
- **Schema** in `ddl.sql` with tables: `red_cogs`, `red_config`
- **JSONB storage** for values
- **Parameterized queries** for safety

```sql
-- ddl.sql key tables
CREATE TABLE red_config.red_cogs (
    cog_name TEXT NOT NULL,
    cog_id TEXT NOT NULL,
    PRIMARY KEY (cog_name, cog_id)
);

CREATE TABLE red_config.red_config (
    cog_name TEXT NOT NULL,
    cog_id TEXT NOT NULL,
    category TEXT NOT NULL,
    primary_key TEXT[] NOT NULL,
    identifiers TEXT[] NOT NULL,
    data JSONB NOT NULL,
    PRIMARY KEY (cog_name, cog_id, category, primary_key, identifiers)
);
```

```python
class PostgresDriver(BaseDriver):
    _pool: Optional[asyncpg.Pool] = None
    
    @classmethod
    async def initialize(cls, **storage_details):
        cls._pool = await asyncpg.create_pool(...)
        # Run DDL
    
    async def get(self, identifier_data):
        row = await self._pool.fetchrow(
            "SELECT data FROM red_config.red_config WHERE ...",
            *encode_identifier_data(identifier_data)
        )
        return json.loads(row["data"]) if row else KeyError
    
    async def set(self, identifier_data, value):
        await self._pool.execute(
            "INSERT ... ON CONFLICT ... UPDATE SET data = $1",
            json.dumps(value), *encode_identifier_data(identifier_data)
        )
```

### 1.8 MongoDB Driver (`core/_drivers/_mongo.py`)

**Status**: Legacy/deprecated - retained only for migration. Marked for removal.

```python
# "Below File is not supported for anything other than conversion
# away and will be removed at a later date"
```

---

## 2. Cog Lifecycle & Dependency Management

### 2.1 Cog Discovery (`core/_cog_manager.py`)

```python
class CogManager:
    CORE_PATH = Path(redbot.cogs.__path__[0]).resolve()
    
    def __init__(self):
        self.config = Config.get_conf(self, 2938473984732, True)
        # Registers paths, install_path
    
    async def paths(self) -> List[Path]:
        """Priority order: install_path > temp_paths > user_paths > core_path"""
        return deduplicate_iterables(
            [await self.install_path()],
            _TEMP_PATHS,
            await self.user_defined_paths(),
            [self.CORE_PATH],
        )
    
    async def find_cog(self, name: str) -> Optional[ModuleSpec]:
        """Search order: 3rd party paths first, then core cogs"""
        try:
            return await self._find_ext_cog(name)
        except NoSuchCog:
            return await self._find_core_cog(name)
```

### 2.2 Extension Loading (`core/bot.py`)

```python
class Red(commands.GroupMixin, RPCMixin, dpy_commands.AutoShardedBot):
    
    async def load_extension(self, spec: ModuleSpec):
        """Bypasses discord.py's _load_from_module_spec"""
        name = spec.name.split(".")[-1]
        if name in self.extensions:
            raise errors.PackageAlreadyLoaded(spec)
        
        lib = spec.loader.load_module()
        if not hasattr(lib, "setup"):
            del lib
            raise discord.ClientException(f"extension {name} has no setup()")
        
        try:
            await lib.setup(self)              # Cog registration happens here
            await self.tree.red_check_enabled()
        except Exception as e:
            await self._remove_module_references(lib.__name__)
            await self._call_module_finalizers(lib, name)
            raise
        else:
            self._BotBase__extensions[name] = lib
    
    async def remove_cog(self, cogname, *, guild=MISSING, guilds=MISSING):
        cog = self.get_cog(cogname)
        if cog is None:
            return
        
        # Clean up permissions hooks
        for cls in inspect.getmro(cog.__class__):
            hook = getattr(cog, f"_{cls.__name__}__permissions_hook", None)
            if hook:
                self.remove_permissions_hook(hook)
        
        await super().remove_cog(cogname, guild=guild, guilds=guilds)
        self.dispatch("cog_remove", cog)
        cog.requires.reset()
        
        # Clean up RPC handlers
        for meth in self.rpc_handlers.pop(cogname.upper(), ()):
            self.unregister_rpc_handler(meth)
        
        return cog
```

### 2.3 Load/Unload/Reload Logic (`core/core_commands.py`)

```python
class CoreLogic:
    def __init__(self, bot: "Red"):
        self.bot = bot
    
    @staticmethod
    def _cleanup_and_refresh_modules(module_name: str):
        """Force re-execution of module and submodules for hot reload"""
        # Reload parent modules
        for m in itertools.accumulate(module_name.split("."), "{}.{}".format):
            if m in sys.modules:
                importlib._bootstrap._exec(sys.modules[m].__spec__, sys.modules[m])
        
        # Reload child modules
        children = {name: lib for name, lib in sys.modules.items() 
                   if name == module_name or name.startswith(f"{module_name}.")}
        for lib in children.values():
            importlib._bootstrap._exec(lib.__spec__, lib)
    
    async def _unload(self, pkg_names: Iterable[str]):
        for name in pkg_names:
            if name in bot.extensions:
                await bot.unload_extension(name)
                await bot.remove_loaded_package(name)
                unloaded.append(name)
            else:
                notloaded.append(name)
        return {"unloaded_packages": unloaded, "notloaded_packages": notloaded}
    
    async def _reload(self, pkg_names: Sequence[str]):
        await self._unload(pkg_names)
        return await self._load(pkg_names)
    
    async def _load(self, pkg_names: Iterable[str]):
        # Find specs via CogManager
        # Import module (with error handling)
        # Call lib.setup(bot)
        # Track loaded/failed packages
        # Handle shared library checks
```

### 2.4 Cog Setup Pattern

```python
# In cog's __init__.py or main file
async def setup(bot: Red):
    cog = MyCog(bot)
    await bot.add_cog(cog)

# Cog class inherits from commands.Cog
class MyCog(commands.Cog):
    def __init__(self, bot: Red):
        self.bot = bot
        self.config = Config.get_conf(self, UNIQUE_ID, force_registration=True)
        # Register defaults
        self.config.register_global(setting=True)
        self.config.register_guild(setting=False)
    
    def cog_unload(self):
        """Optional cleanup - called during unload"""
        # Cancel tasks, close connections, etc.
```

### 2.5 Dependency Resolution

**No explicit dependency system** - cogs load independently. Order matters only for:
- Permissions cog must load before other cogs for rule enforcement
- Shared libraries via `redbot.core.utils.chat_formatting` etc.

```python
# In core_commands.py _load()
# Check for shared library conflicts
for name, lib in sys.modules.items():
    if hasattr(lib, "__red_shared_lib__"):
        # Handle shared library version conflicts
```

---

## 3. Permissions / Predicates System

### 3.1 Core Permission Model (`core/commands/requires.py`)

#### Privilege Levels
```python
class PrivilegeLevel(enum.IntEnum):
    NONE = 0
    MOD = 1
    ADMIN = 2
    GUILD_OWNER = 3
    BOT_OWNER = 4
    
    @classmethod
    async def from_ctx(cls, ctx) -> "PrivilegeLevel":
        # Check bot owner -> guild owner -> admin role -> mod role
```

#### Permission States
```python
class PermState(enum.Enum):
    NORMAL = "normal"              # Use default checks
    ACTIVE_ALLOW = "allow"         # Explicitly allow
    ACTIVE_DENY = "deny"           # Explicitly deny
    PASSIVE_ALLOW = "passive_allow"  # Allow unless explicitly denied
    PASSIVE_DENY = "passive_deny"    # Deny unless explicitly allowed
    ALLOWED_BY_HOOK = "allowed_by_hook"  # Permissions hook override
    DENIED_BY_HOOK = "denied_by_hook"    # Permissions hook override
```

#### State Transitions
```python
# PermStateTransitions defines valid state changes
# Key insight: Rules can "transition" from NORMAL to PASSIVE_ALLOW
# based on default rule configuration

def transition_permstate_to(prev: PermState, next_state: PermState) -> TransitionResult:
    # Returns (should_invoke: Optional[bool], next_state)
    # should_invoke=None means "use normal verification"
```

#### Requires Class (Per-Command/Cog)
```python
class Requires:
    def __init__(self, cog_name=None, command_name=None,
                 privilege_level=None, user_perms=None, bot_perms=None,
                 checks=None):
        self.cog_name = cog_name
        self.command_name = command_name
        self.privilege_level = privilege_level
        self.user_perms = user_perms or discord.Permissions.none()
        self.bot_perms = bot_perms or discord.Permissions.none()
        self.checks = checks or []
        
        # Rule storage: guild_id -> {model_id: PermState}
        self._guild_rules: Dict[int, _RulesDict] = {}
        self._global_rules: _RulesDict = _RulesDict()
        self.ready_event = asyncio.Event()
    
    def get_rule(self, model: Union[int, str, PermissionModel], guild_id: int) -> PermState:
        if guild_id:
            rules = ChainMap(self._global_rules, self._guild_rules.get(guild_id, _RulesDict()))
        else:
            rules = self._global_rules
        return rules.get(model, PermState.NORMAL)
    
    def set_rule(self, model_id: Union[str, int], rule: PermState, guild_id: int):
        if guild_id:
            rules = self._guild_rules.setdefault(guild_id, _RulesDict())
        else:
            rules = self._global_rules
        if rule is PermState.NORMAL:
            rules.pop(model_id, None)
        else:
            rules[model_id] = rule
    
    async def verify(self, ctx: Context) -> bool:
        if not self.ready_event.is_set():
            await self.ready_event.wait()
        
        await self._verify_bot(ctx)
        
        # Bot owner bypasses all user permission checks
        if await ctx.bot.is_owner(ctx.author):
            return True
        
        # Bot-owner-only commands cannot be overridden
        if self.privilege_level is PrivilegeLevel.BOT_OWNER:
            return False
        
        # Permissions hooks (from permissions cog)
        hook_result = await ctx.bot.verify_permissions_hooks(ctx)
        if hook_result is not None:
            return hook_result
        
        return await self._transition_state(ctx)
```

### 3.2 Rule Resolution Chain

```python
def _get_rule_from_ctx(self, ctx: Context) -> PermState:
    if ctx.guild is None:
        # DM: only check user + global default
        rule = self._global_rules.get(ctx.author.id)
        if rule: return rule
        return self.get_rule(self.DEFAULT, self.GLOBAL)
    
    # Build model chain: user -> channels -> roles -> guild
    rules_chain = [self._global_rules]
    if guild_rules := self._guild_rules.get(ctx.guild.id):
        rules_chain.append(guild_rules)
    
    channels = []
    if ctx.author.voice:
        channels.append(ctx.author.voice.channel)
    if isinstance(ctx.channel, discord.Thread):
        channels.append(ctx.channel.parent)
    else:
        channels.append(ctx.channel)
    if ctx.channel.category:
        channels.append(ctx.channel.category)
    
    author_roles = reversed(ctx.author.roles[1:])  # exclude @everyone, highest first
    model_chain = [ctx.author, *channels, *author_roles, ctx.guild]
    
    # Check each rules dict for each model
    for rules in rules_chain:
        for model in model_chain:
            if rule := rules.get(model.id):
                return rule
        model_chain.pop()  # Don't check guild in guild rules
    
    # Fallback to defaults
    default = self.get_rule(self.DEFAULT, ctx.guild.id)
    if default is PermState.NORMAL:
        default = self.get_rule(self.DEFAULT, self.GLOBAL)
    return default
```

### 3.3 Permission Decorators

```python
# User permissions (overridable by rules)
@commands.has_permissions(manage_messages=True)
@commands.can_manage_channel(allow_thread_owner=True)
@commands.guildowner_or_permissions(administrator=True)
@commands.admin_or_permissions(manage_guild=True)
@commands.mod_or_permissions(kick_members=True)

# Special privilege levels (not overridable for BOT_OWNER)
@commands.is_owner()              # PrivilegeLevel.BOT_OWNER
@commands.guildowner()            # PrivilegeLevel.GUILD_OWNER
@commands.admin()                 # PrivilegeLevel.ADMIN
@commands.mod()                   # PrivilegeLevel.MOD

# Bot permissions (NOT overridable)
@commands.bot_has_permissions(manage_channels=True)
@commands.bot_can_manage_channel(allow_thread_owner=True)
@commands.bot_can_react()
@commands.bot_in_a_guild()

# Custom check (overridable)
@commands.permissions_check(predicate)
```

### 3.4 Permissions Cog (`cogs/permissions/permissions.py`)

- **YAML-based rule export/import** for backup
- **Rule types**: cog-level and command-level
- **Scope**: global (guild_id=0) or per-guild
- **Models**: users, roles, channels, "default" fallback

```python
class Permissions(commands.Cog):
    """Customise permissions for commands and cogs."""
    
    # Config schema: 
    # "COG" -> cog_name -> guild_id -> model_id -> bool
    # "COMMAND" -> command_name -> guild_id -> model_id -> bool
    
    @commands.group()
    async def permissions(self, ctx): ...
    
    @permissions.command()
    async def add(self, ctx, allow_or_deny: Literal["allow", "deny"],
                  cog_or_command: CogOrCommand, *who_or_what: Greedy[Union[Member, Role, TextChannel]]):
        # Adds rule to config
    
    @permissions.command()
    async def remove(self, ctx, cog_or_command: CogOrCommand, *who_or_what: ...):
        # Removes rule
    
    @permissions.command()
    async def default(self, ctx, cog_or_command: CogOrCommand, allow_or_deny: Literal["allow", "deny"]):
        # Sets default rule (NORMAL -> ACTIVE_ALLOW/ACTIVE_DENY)
    
    def __permissions_hook(self, ctx) -> Optional[bool]:
        """Hook registered with bot.add_permissions_hook()"""
        # Called during Requires.verify() before normal checks
        # Returns True/False to override, None to continue normal flow
```

### 3.5 Predicate Utilities (`core/utils/predicates.py`)

```python
class MessagePredicate(Callable[[Message], bool]):
    """Reusable predicates for wait_for('message')"""
    @classmethod
    def same_context(cls, channel=None, user=None): ...
    @classmethod
    def contains(cls, *substrings): ...
    @classmethod
    def equal_to(cls, content): ...
    @classmethod
    def length(cls, min_, max_): ...
    @classmethod
    def regex(cls, pattern): ...
    @classmethod
    def valid_int(cls): ...
    @classmethod
    def valid_float(cls): ...

class ReactionPredicate(Callable[[Reaction, User], bool]):
    """Reusable predicates for wait_for('reaction_add')"""
    YES_OR_NO_EMOJIS = ("✅", "❌")
    ALPHABET_EMOJIS = ("🇦", "🇧", ...)
    NUMBER_EMOJIS = ("0️⃣", "1️⃣", ...)
    
    @classmethod
    def same_context(cls, message=None, user=None): ...
    @classmethod
    def with_emojis(cls, *emojis): ...
    @classmethod
    def yes_or_no(cls, message=None, user=None): ...
```

---

## 4. Web Dashboard Communication (RPC)

### 4.1 RPC Architecture (`core/_rpc.py`)

```python
class RedRpc(JsonRpc):
    """aiohttp-json-rpc server with method discovery"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.add_methods(("", self.get_method_info))
    
    def add_method(self, method, name="", prefix=""):
        # Auto-generates name: "ClassName__methodName" or "methodName"
        meth_name = get_name(method, prefix)
        self.methods[meth_name] = JsonRpcMethod(method)
    
    def remove_method(self, method): ...
    def remove_methods(self, prefix: str): ...


class RPC:
    """Wrapper around RedRpc for aiohttp app integration"""
    def __init__(self, bot: Red):
        self.bot = bot
        self._rpc = RedRpc()
        self._rpc.add_methods(("red", self._red_methods()))
    
    async def handle(self, request):
        return await self._rpc.handle_request(request)


class RPCMixin:
    """Mixin for Red bot to expose RPC handlers"""
    def __init__(self, **kwargs):
        self.rpc_handlers: Dict[str, List[Callable]] = defaultdict(list)
        self._rpc: Optional[RPC] = None
    
    def register_rpc_handler(self, func):
        """Decorator: @bot.register_rpc_handler"""
        name = get_name(func).upper()
        self.rpc_handlers[name].append(func)
        if self._rpc:
            self._rpc._rpc.add_method(func, name)
    
    def unregister_rpc_handler(self, func): ...
```

### 4.2 Core RPC Methods (`core/core_commands.py`)

```python
class CoreLogic:
    def __init__(self, bot: Red):
        self.bot = bot
        # Register core RPC handlers
        bot.register_rpc_handler(self._load)
        bot.register_rpc_handler(self._unload)
        bot.register_rpc_handler(self._reload)
        bot.register_rpc_handler(self._name)
        bot.register_rpc_handler(self._prefixes)
        bot.register_rpc_handler(self._version_info)
        bot.register_rpc_handler(self._invite_url)
    
    async def _load(self, pkg_names: List[str]): ...
    async def _unload(self, pkg_names: List[str]): ...
    async def _reload(self, pkg_names: List[str]): ...
    async def _name(self, name: Optional[str]): ...
    async def _prefixes(self, prefixes: Optional[List[str]]): ...
    async def _version_info(self): ...
    async def _invite_url(self): ...
```

### 4.3 Dashboard Integration (`core/core_commands.py`)

```python
# RPC endpoints for dashboard
async def rpc_load(self, request):
    pkg_name = request.params[0]
    result = await self._load([pkg_name])
    return result

async def rpc_unload(self, request):
    cog_name = request.params[0]
    await self.bot.unload_extension(cog_name)
    return {"status": "ok"}

async def rpc_reload(self, request):
    await self.rpc_unload(request)
    await self.rpc_load(request)
```

---

## 5. Settings Caches (`core/_settings_caches.py`)

High-performance in-memory caches for frequently accessed config:

| Cache | Purpose | Backend |
|-------|---------|---------|
| `PrefixManager` | Command prefixes per guild | Config + memory dict |
| `I18nManager` | Locale/regional format per guild | Config + memory dict |
| `IgnoreManager` | Ignored channels/users per guild | Config + memory set |
| `WhitelistBlacklistManager` | Command whitelist/blacklist | Config + memory dict |
| `DisabledCogCache` | Disabled cogs per guild | Config + memory set |

```python
class PrefixManager:
    def __init__(self, config: Config, cli_flags: Namespace):
        self._config = config
        self._cached: Dict[Optional[int], List[str]] = {}
        # Preload from CLI flags
    
    async def get_prefixes(self, guild: Optional[Guild] = None) -> List[str]:
        gid = guild.id if guild else None
        if gid not in self._cached:
            self._cached[gid] = await self._config.guild_from_id(gid).prefix() if gid else await self._config.prefix()
        return self._cached[gid]
    
    async def set_prefixes(self, guild, prefixes):
        gid = guild.id if guild else None
        self._cached[gid] = prefixes
        await self._config.guild_from_id(gid).prefix.set(prefixes) if gid else await self._config.prefix.set(prefixes)
```

---

## 6. Key Architectural Patterns Summary

### 6.1 Configuration Flow
```
Cog.setup(bot) 
  → Config.get_conf(cog, ID) 
    → ConfigMeta.__call__ (singleton check)
      → Config.__init__(driver=get_driver())
        → driver = get_driver(cog_name, identifier) 
          → BackendType from data_manager.storage_type()
            → JsonDriver / PostgresDriver
```

### 6.2 Command Execution Flow
```
Message received
  → bot.process_commands()
    → get_context()
      → RedTree.get_context() (app commands)
    → invoke(context)
      → command.requires.verify(ctx)
        → bot_perms check (non-overridable)
        → is_owner check (bypass)
        → permissions hooks (Permissions cog)
        → state transition logic
        → user perms / privilege level check
      → command.callback()
```

### 6.3 Hot Reload Flow
```
[p]reload cogname
  → CoreLogic._reload([cogname])
    → _unload()
      → bot.unload_extension()
        → cog.cog_unload()
        → remove_cog() → dispatch("cog_remove")
        → _remove_module_references()
        → _call_module_finalizers()
    → _cleanup_and_refresh_modules()  # re-exec module code
    → _load()
      → find_cog() → load_extension()
        → lib.setup(bot) → add_cog()
```

---

## 7. Files Reference

| Area | Key Files |
|------|-----------|
| Config API | `core/config.py`, `core/_config.py` |
| Drivers | `core/_drivers/base.py`, `json.py`, `postgres/postgres.py`, `_mongo.py`, `__init__.py` |
| Cog Management | `core/_cog_manager.py`, `core/bot.py` (load_extension, remove_cog, add_cog) |
| Load/Unload/Reload | `core/core_commands.py` (CoreLogic._load, _unload, _reload) |
| Permissions Core | `core/commands/requires.py` |
| Permissions Cog | `cogs/permissions/permissions.py`, `converters.py` |
| Predicates | `core/utils/predicates.py` |
| RPC | `core/_rpc.py`, `core/core_commands.py` (rpc_* methods) |
| Settings Caches | `core/_settings_caches.py` |
| Data Manager | `core/data_manager.py` (paths, storage_type) |

---

## 8. Notable Design Decisions

1. **Weakref Config Cache** - Prevents memory leaks, allows GC of unused Config instances
2. **Driver Abstraction** - Clean separation enables JSON/Postgres swap without cog changes
3. **Double-Underscore Nesting** - `foo__bar` enables nested defaults without dict literals
4. **Permission State Machine** - Explicit transitions prevent rule conflicts, support passive modes
5. **Bot Owner Bypass** - Hard-coded override for safety, cannot be ruled away
6. **Module Re-execution Reload** - Uses `importlib._bootstrap._exec` for true hot reload
7. **RPC Method Naming** - Auto-generated from class+method for dashboard discoverability
8. **Atomic JSON Writes** - Temp file + fsync + rename prevents corruption on crash
9. **Settings Caches** - Avoids config driver round-trips for hot paths (prefixes, ignored channels)
10. **No Explicit Cog Dependencies** - Simplicity over complexity; load order handled by convention