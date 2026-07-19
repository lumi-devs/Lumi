const fs = require('fs');
const path = require('path');

const srcDir = path.join('/home/rebiz/opt/lumi/packages/core/src');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir(srcDir, (filePath) => {
  if (!filePath.endsWith('.ts')) return;
  
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Check if it imports Colors from branding
  if (content.includes('#lib/utilities/branding.js')) {
    let original = content;
    
    // Replace Colors.XXX with 0
    content = content.replace(/Colors\.[A-Z_]+/g, '0');
    
    // Remove Colors from import
    content = content.replace(/,\s*Colors\b|\bColors\s*,?\s*/g, '');
    
    // If import becomes empty, remove the whole import line
    content = content.replace(/import\s*\{\s*\}\s*from\s*["']#lib\/utilities\/branding\.js["'];?\n/g, '');
    
    if (original !== content) {
      fs.writeFileSync(filePath, content);
      console.log(`Updated ${filePath}`);
    }
  }
});

// Remove from branding.ts itself
const brandingPath = path.join(srcDir, 'lib/utilities/branding.ts');
let brandingContent = fs.readFileSync(brandingPath, 'utf-8');
brandingContent = brandingContent.replace(/export const Colors = [^\n]+;\n*/, '');
fs.writeFileSync(brandingPath, brandingContent);
console.log(`Updated branding.ts`);
