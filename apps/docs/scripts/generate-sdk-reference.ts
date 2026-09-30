import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const DOCS_ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const REPO_ROOT = path.resolve(DOCS_ROOT, "../../");

interface SdkExport {
  name: string;
  kind: string;
  signature: string;
  summary: string;
}

interface SdkImportGroup {
  importPath: string;
  file: string;
  exports: SdkExport[];
}

async function resolveEntryPoints(): Promise<{ importPath: string; file: string }[]> {
  const raw = await fs.readFile(path.join(REPO_ROOT, "package.json"), "utf8");
  const pkg = JSON.parse(raw) as { exports?: Record<string, string> };
  const exportsMap = pkg.exports ?? {};
  const entries: { importPath: string; file: string }[] = [];
  const sdkPrefix = "./packages/core/src/lib/addon-sandbox/sdk/";
  for (const [subpath, relFile] of Object.entries(exportsMap)) {
    if (typeof relFile !== "string" || !relFile.startsWith(sdkPrefix)) continue;
    const importPath = subpath === "." ? "lumi" : `lumi/${subpath.slice(2)}`;
    entries.push({ importPath, file: path.join(REPO_ROOT, relFile.slice(2)) });
  }
  entries.sort((a, b) => a.importPath.localeCompare(b.importPath));
  return entries;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === kind) ?? false);
}

function isPublicMember(member: ts.ClassElement): boolean {
  if (hasModifier(member, ts.SyntaxKind.PrivateKeyword)) return false;
  if (hasModifier(member, ts.SyntaxKind.ProtectedKeyword)) return false;
  if (ts.isPropertyDeclaration(member) && ts.isPrivateIdentifier(member.name)) return false;
  if (ts.isMethodDeclaration(member) && ts.isPrivateIdentifier(member.name)) return false;
  return true;
}

function memberName(member: ts.ClassElement): string | null {
  if (ts.isConstructorDeclaration(member)) return "constructor";
  const name = (member as { name?: ts.PropertyName }).name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function classSignature(checker: ts.TypeChecker, decl: ts.ClassLikeDeclaration, name: string): string {
  const isAbstract = hasModifier(decl, ts.SyntaxKind.AbstractKeyword);
  const lines = [`${isAbstract ? "abstract " : ""}class ${name} {`];
  for (const member of decl.members) {
    if (!isPublicMember(member)) continue;
    const label = memberName(member);
    if (label === null) continue;
    const readonly = hasModifier(member, ts.SyntaxKind.ReadonlyKeyword) ? "readonly " : "";
    const abstractPrefix = hasModifier(member, ts.SyntaxKind.AbstractKeyword) ? "abstract " : "";
    if (
      ts.isMethodDeclaration(member) ||
      ts.isMethodSignature(member) ||
      ts.isConstructorDeclaration(member)
    ) {
      const sig = checker.getSignatureFromDeclaration(member);
      const sigText = sig ? checker.signatureToString(sig, member) : "()";
      lines.push(`  ${abstractPrefix}${label}${sigText};`);
    } else if (
      ts.isPropertyDeclaration(member) ||
      ts.isPropertySignature(member) ||
      ts.isGetAccessorDeclaration(member)
    ) {
      const type = checker.getTypeAtLocation(member);
      const typeText = checker.typeToString(type, member, ts.TypeFormatFlags.NoTruncation);
      lines.push(`  ${readonly}${label}: ${typeText};`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}

const MaxSignatureLength = 400;

function trimSignature(text: string): string {
  return text.length > MaxSignatureLength ? `${text.slice(0, MaxSignatureLength)}…` : text;
}

function printerFor(sourceFile: ts.SourceFile): (node: ts.Node) => string {
  const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
  return (node) => printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
}

function describeExport(
  checker: ts.TypeChecker,
  name: string,
  symbol: ts.Symbol,
  sourceFile: ts.SourceFile,
): SdkExport | null {
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const decl = resolved.valueDeclaration ?? resolved.declarations?.[0];
  if (!decl) return null;

  const docSource = symbol.getDocumentationComment(checker).length
    ? symbol
    : resolved;
  const summary = ts.displayPartsToString(docSource.getDocumentationComment(checker)).trim();
  const print = printerFor(decl.getSourceFile() ?? sourceFile);

  if (ts.isFunctionDeclaration(decl)) {
    const sig = checker.getSignatureFromDeclaration(decl);
    const sigText = sig ? checker.signatureToString(sig, decl) : "()";
    return { name, kind: "function", signature: trimSignature(`function ${name}${sigText}`), summary };
  }
  if (ts.isClassDeclaration(decl)) {
    return { name, kind: "class", signature: classSignature(checker, decl, name), summary };
  }
  if (ts.isInterfaceDeclaration(decl)) {
    return { name, kind: "interface", signature: print(decl).trim(), summary };
  }
  if (ts.isTypeAliasDeclaration(decl)) {
    return { name, kind: "type", signature: print(decl).trim(), summary };
  }
  if (ts.isEnumDeclaration(decl)) {
    return { name, kind: "enum", signature: print(decl).trim(), summary };
  }
  if (ts.isVariableDeclaration(decl)) {
    const type = checker.getTypeOfSymbolAtLocation(resolved, decl);
    const typeText = checker.typeToString(type, decl);
    return { name, kind: "const", signature: trimSignature(`const ${name}: ${typeText}`), summary };
  }
  if (ts.isModuleDeclaration(decl)) {
    return { name, kind: "namespace", signature: print(decl).trim(), summary };
  }
  return { name, kind: "value", signature: name, summary };
}

export async function generateSdkReference(
  writeGenerated: (file: string, content: string) => Promise<void>,
): Promise<void> {
  const entryPoints = await resolveEntryPoints();
  if (entryPoints.length === 0) {
    throw new Error("[generate-sdk-reference] no addon-sandbox/sdk entries found in root package.json exports");
  }

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    customConditions: ["bun"],
    esModuleInterop: true,
    resolveJsonModule: true,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    experimentalDecorators: true,
    baseUrl: REPO_ROOT,
    paths: {
      "@lumi/contracts": [path.join(REPO_ROOT, "packages/contracts/src/index.ts")],
      "@lumi/contracts/views": [path.join(REPO_ROOT, "packages/contracts/src/views.ts")],
      "@lumi/contracts/rpc": [path.join(REPO_ROOT, "packages/contracts/src/rpc/index.ts")],
      "@lumi/contracts/events": [path.join(REPO_ROOT, "packages/contracts/src/events.ts")],
      "#lib/env.js": [path.join(REPO_ROOT, "packages/core/src/lib/env.ts")],
      "#lib/*.js": [path.join(REPO_ROOT, "packages/core/src/lib/*.ts")],
    },
  };

  const program = ts.createProgram(
    entryPoints.map((e) => e.file),
    compilerOptions,
  );
  const checker = program.getTypeChecker();

  const groups: SdkImportGroup[] = [];
  for (const entry of entryPoints) {
    const sourceFile = program.getSourceFile(entry.file);
    if (!sourceFile) {
      throw new Error(`[generate-sdk-reference] could not load source file for ${entry.importPath} (${entry.file})`);
    }
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) {
      throw new Error(`[generate-sdk-reference] ${entry.importPath} has no module symbol — is it a valid ES module?`);
    }
    const exportedSymbols = checker.getExportsOfModule(moduleSymbol);
    const exports: SdkExport[] = [];
    for (const symbol of exportedSymbols) {
      const described = describeExport(checker, symbol.getName(), symbol, sourceFile);
      if (described) exports.push(described);
    }
    exports.sort((a, b) => a.name.localeCompare(b.name));
    if (exports.length === 0) {
      throw new Error(`[generate-sdk-reference] ${entry.importPath} exports nothing — check the entry file`);
    }
    groups.push({
      importPath: entry.importPath,
      file: path.relative(REPO_ROOT, entry.file),
      exports,
    });
  }

  const exportCount = groups.reduce((total, g) => total + g.exports.length, 0);

  await writeGenerated(
    "sdk-reference.ts",
    `export interface SdkExportEntry {
  name: string;
  kind: string;
  signature: string;
  summary: string;
}

export interface SdkImportGroup {
  importPath: string;
  file: string;
  exports: SdkExportEntry[];
}

export const sdkImportGroups: SdkImportGroup[] = ${JSON.stringify(groups, null, 2)};

export const sdkExportCount: number = ${exportCount};
`,
  );
}
