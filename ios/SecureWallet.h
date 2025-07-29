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

// Sign transaction method
- (void)signTransaction:(NSDictionary *)txData
              resolver:(RCTPromiseResolveBlock)resolve
              rejecter:(RCTPromiseRejectBlock)reject;

// Check if Secure Enclave is available
- (void)isSecureEnclaveAvailable:(RCTPromiseResolveBlock)resolve
                        rejecter:(RCTPromiseRejectBlock)reject;

@end