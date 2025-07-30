const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withSecureWallet = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosProjectPath = path.join(config.modRequest.projectRoot, 'ios');
      const secureWalletPath = path.join(iosProjectPath, 'SecureWallet');
      
      // Create SecureWallet directory if it doesn't exist
      if (!fs.existsSync(secureWalletPath)) {
        fs.mkdirSync(secureWalletPath, { recursive: true });
      }
      
      // Ensure the SecureWallet files are copied to the iOS project
      const secureWalletFiles = [
        'SecureWallet.h',
        'SecureWallet.m',
        'SecureWallet.podspec'
      ];
      
      secureWalletFiles.forEach(file => {
        const sourcePath = path.join(config.modRequest.projectRoot, 'ios', file);
        const destPath = path.join(secureWalletPath, file);
        
        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, destPath);
          console.log(`Copied ${file} to iOS project`);
        } else {
          console.warn(`Warning: ${file} not found at ${sourcePath}`);
        }
      });
      
      return config;
    },
  ]);
};

module.exports = withSecureWallet; 