const fs = require('fs');

// These are patterns produced by the previous broken replace script
// that introduced duplicated dark: prefixes. We clean them here.
const brokenPatterns = [
  // Remove duplicate dark classes produced by chain-replace
  [/text-gray-500 dark:text-gray-400 dark:text-gray-500/g, 'text-theme-muted'],
  [/text-gray-400 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500/g, 'text-theme-muted'],
  [/text-gray-600 dark:text-gray-400 dark:text-gray-500/g, 'text-theme-secondary'],
  [/text-gray-700 dark:text-gray-300/g, 'text-theme-secondary'],
  [/text-gray-600 dark:text-gray-400/g, 'text-theme-secondary'],
  [/text-gray-500 dark:text-gray-400/g, 'text-theme-muted'],
  [/text-gray-400 dark:text-gray-500/g, 'text-theme-muted'],
  [/text-gray-900 dark:text-gray-100/g, 'text-theme'],
  // Broken bg classes
  [/bg-gray-100 dark:bg-gray-800 dark:bg-gray-800/g, 'bg-theme-overlay'],
  [/bg-gray-100 dark:bg-gray-800/g, 'bg-theme-overlay'],
  [/bg-gray-50 dark:bg-gray-800\/50/g, 'bg-theme-hover'],
  [/hover:bg-gray-50 dark:bg-gray-800\/50/g, 'bg-theme-hover'],
  [/hover:bg-gray-50 bg-theme-hover/g, 'hover:bg-theme-card-hover'],
  [/hover:bg-gray-50/g, 'bg-theme-hover'],
  [/bg-\[#F5F5F5\] dark:bg-gray-800/g, 'bg-theme-overlay'],
  // Border  
  [/border-gray-300/g, 'border-theme'],
  // Input labels
  [/text-gray-700 dark:text-gray-300 mb-1\.5/g, 'text-theme-secondary mb-1.5'],
  // Hover items in lists
  [/hover:bg-\[#F5F5F5\]/g, 'bg-theme-hover'],
  [/hover:bg-\[#d9f2ee\]/g, 'hover:bg-litter-primary-light'],
  // Scrollbar handle class for close buttons
  [/hover:bg-gray-100 dark:bg-gray-800 transition/g, 'bg-theme-hover transition'],
  [/hover:bg-gray-100 dark:bg-gray-800/g, 'bg-theme-hover'],
];

function walk(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const full = dir + '/' + file;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) results = results.concat(walk(full));
      else if (full.endsWith('.tsx') || full.endsWith('.ts')) results.push(full);
    });
  } catch(e) {}
  return results;
}

const files = [...walk('./app'), ...walk('./components')];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  for (const [pattern, replacement] of brokenPatterns) {
    content = content.replace(pattern, replacement);
  }
  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log('Fixed: ' + file);
  }
});

console.log('Done!');
