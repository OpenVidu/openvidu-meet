const { generateTypes } = require('./generators/generate-types');
const { generateCem } = require('./generators/generate-cem');
const { generateReactWrapper } = require('./generators/generate-react-wrapper');
const { generateAngularWrapper } = require('./generators/generate-angular-wrapper');

/**
 * Runs all API artifact generators from the single contract definition.
 */
function generateApi() {
  console.log('[api] generating artifacts from contracts/openvidu-meet.contract.js');
  generateTypes();
  generateCem();
  generateReactWrapper();
  generateAngularWrapper();
  console.log('[api] generation completed');
}

if (require.main === module) {
  generateApi();
}

module.exports = {
  generateApi,
};
