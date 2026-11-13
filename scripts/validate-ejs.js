#!/usr/bin/env node
/**
 * EJS Template Validation Script
 * Validates all EJS files for syntax errors
 */

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const viewsDir = path.join(__dirname, '..', 'src', 'views');

let totalFiles = 0;
let validFiles = 0;
let errorFiles = 0;

function validateEjsFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Try to compile the template
    ejs.compile(content, {
      filename: filePath,
      compileDebug: true
    });
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

function walkDir(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDir(filePath, fileList);
    } else if (file.endsWith('.ejs')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

console.log('🔍 Validating EJS templates...\n');

const ejsFiles = walkDir(viewsDir);
totalFiles = ejsFiles.length;

console.log(`Found ${totalFiles} EJS files\n`);

const errors = [];

ejsFiles.forEach(file => {
  const relativePath = path.relative(viewsDir, file);
  const result = validateEjsFile(file);
  
  if (result.valid) {
    validFiles++;
    console.log(`✅ ${relativePath}`);
  } else {
    errorFiles++;
    console.log(`❌ ${relativePath}`);
    errors.push({ file: relativePath, error: result.error });
  }
});

console.log('\n' + '='.repeat(60));
console.log(`\n📊 Validation Summary:`);
console.log(`   Total files: ${totalFiles}`);
console.log(`   Valid: ${validFiles} ✅`);
console.log(`   Errors: ${errorFiles} ❌`);

if (errors.length > 0) {
  console.log('\n❌ Errors found:\n');
  errors.forEach(({ file, error }) => {
    console.log(`\n📄 ${file}:`);
    console.log(`   ${error}`);
  });
  process.exit(1);
} else {
  console.log('\n✅ All EJS templates are valid!\n');
  process.exit(0);
}
