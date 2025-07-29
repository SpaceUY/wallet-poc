#import <React/RCTBridgeModule.h>
#import <Foundation/Foundation.h>

@interface SecureWallet : NSObject <RCTBridgeModule>

// Check for existing wallet
- (void)checkForExistingWallet:(RCTPromiseResolveBlock)resolve
                      rejecter:(RCTPromiseRejectBlock)reject;

// Main wallet generation method
- (void)generateSecureWallet:(NSDictionary *)config
                   resolver:(RCTPromiseResolveBlock)resolve
                   rejecter:(RCTPromiseRejectBlock)reject;

// Sign transaction hash method
- (void)signTransactionHash:(NSString *)transactionHash
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject;

// Check if Secure Enclave is available
- (void)isSecureEnclaveAvailable:(RCTPromiseResolveBlock)resolve
                        rejecter:(RCTPromiseRejectBlock)reject;

// Private helper methods
- (NSData *)generateSecureEntropy:(NSUInteger)bytes;
- (NSString *)entropyToMnemonic:(NSData *)entropy;
- (NSData *)derivePrivateKeyFromSeedPhrase:(NSString *)seedPhrase;
- (NSString *)derivePublicKeyFromPrivateKey:(NSData *)privateKeyData;
- (NSData *)signWithSecp256k1:(NSData *)privateKeyData hashData:(NSData *)hashData;
- (NSData *)hexStringToData:(NSString *)hexString;
- (NSString *)formatPublicKey:(NSData *)publicKey;
- (SecAccessControlRef)createAccessControl;
- (BOOL)isSecureEnclavePresent;
- (BOOL)hasExistingWallet;
- (NSDictionary *)getExistingWallet;
- (BOOL)deleteMnemonicFromKeychain;
- (BOOL)storeMnemonicInKeychain:(NSString *)mnemonic;
- (NSData *)deriveEncryptionKeyFromMasterKey:(SecKeyRef)masterKey;

@end