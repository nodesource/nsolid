// Define the JavaScript code as a string
const moduleCode = `
export function blockFor(duration) {
  const start = Date.now();
  while (Date.now() - start < duration);
}
`;

const dataUrl = `data:text/javascript,${moduleCode}`;

async function blockFor(duration) {
  // Dynamically import the module
  const module = await import(dataUrl);
  // Call the blockFor function from the imported module
  module.blockFor(duration);
}

export { blockFor, moduleCode };
