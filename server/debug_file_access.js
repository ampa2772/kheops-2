const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, 'services');
const filePath = path.join(servicesDir, 'docGenerator.js');

console.log("Checking directory:", servicesDir);

try {
  if (fs.existsSync(servicesDir)) {
    console.log("Directory exists. Contents:");
    const files = fs.readdirSync(servicesDir);
    files.forEach(f => console.log(" - " + f));
  } else {
    console.log("Directory does NOT exist.");
  }

  console.log("\nAttempting to read file:", filePath);
  if (fs.existsSync(filePath)) {
    console.log("File exists. Reading content...");
    const content = fs.readFileSync(filePath, 'utf8');
    console.log("--- START FILE CONTENT ---");
    console.log(content);
    console.log("--- END FILE CONTENT ---");
  } else {
    console.log("File does NOT exist at this path.");
  }

} catch (e) {
  console.error("Error:", e);
}
