// Mocha entry executed inside the VS Code extension host.
const path = require('node:path');
const Mocha = require('mocha');
exports.run = () =>
  new Promise((resolve, reject) => {
    const mocha = new Mocha({ ui: 'bdd', timeout: 60000, color: false });
    mocha.addFile(path.join(__dirname, 'extension.test.cjs'));
    mocha.run((failures) => (failures ? reject(new Error(`${failures} integration test(s) failed`)) : resolve()));
  });
