import fs from "fs";
import path from "path";
import ts from "typescript";

function getFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      getFiles(path.join(dir, file), fileList);
    } else if (file.endsWith(".ts")) {
      fileList.push(path.join(dir, file));
    }
  }
  return fileList;
}

const allFiles = [
  ...getFiles("packages/core/src"),
  ...getFiles("apps")
];

const results: any[] = [];

for (const file of allFiles) {
  const code = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  
  const comments: ts.CommentRange[] = [];
  const walk = (node: ts.Node) => {
    const leading = ts.getLeadingCommentRanges(code, node.getFullStart());
    if (leading) comments.push(...leading);
    const trailing = ts.getTrailingCommentRanges(code, node.getEnd());
    if (trailing) comments.push(...trailing);
    ts.forEachChild(node, walk);
  };
  walk(sourceFile);
  
  // Deduplicate and sort
  const uniqueComments = Array.from(new Map(comments.map(c => [c.pos, c])).values())
    .sort((a, b) => a.pos - b.pos);
    
  for (const c of uniqueComments) {
    if (c.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
      const text = code.substring(c.pos, c.end);
      if (text.trim().startsWith("//") && !text.includes("eslint-disable") && !text.includes("@ts-ignore")) {
        const line = code.substring(0, c.pos).split("\n").length;
        results.push({ file, line, text: text.trim() });
      }
    }
  }
}

fs.writeFileSync("/tmp/comments.json", JSON.stringify(results, null, 2));
console.log("Found", results.length, "single-line comments");
