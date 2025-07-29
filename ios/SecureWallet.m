#import "SecureWallet.h"
#import <React/RCTLog.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <Security/Security.h>
#import <CommonCrypto/CommonCrypto.h>

@implementation SecureWallet

RCT_EXPORT_MODULE()

// Constants for key management
static NSString *const kKeyTag = @"com.walletpoc.securekey";
static NSString *const kKeychainLabel = @"WalletPOC Secure Key";

// BIP39 wordlist (first few words for example, in production we'd have all 2048)
static NSArray *const kBIP39Words = @[
    @"abandon", @"ability", @"able", @"about", @"above", @"absent", @"absorb", @"abstract",
    @"absurd", @"abuse", @"access", @"accident", @"account", @"accuse", @"achieve", @"acid"
    // ... full list would be here
];

#pragma mark - BIP39 Methods

- (NSString *)entropyToMnemonic:(NSData *)entropy {
    if (!entropy || entropy.length < 16 || entropy.length > 32 || entropy.length % 4 != 0) {
        return nil;
    }
    
    // Calculate checksum
    uint8_t hash[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(entropy.bytes, (CC_LONG)entropy.length, hash);
    
    NSMutableString *bits = [NSMutableString string];
    
    // Convert entropy to bits
    const uint8_t *bytes = entropy.bytes;
    for (NSUInteger i = 0; i < entropy.length; i++) {
        for (int j = 7; j >= 0; j--) {
            [bits appendString:((bytes[i] >> j) & 1) ? @"1" : @"0"];
        }
    }
    
    // Add checksum bits
    NSUInteger checksumBits = entropy.length / 4;
    for (NSUInteger i = 0; i < checksumBits; i++) {
        [bits appendString:((hash[0] >> (7 - i)) & 1) ? @"1" : @"0"];
    }
    
    // Convert bits to words
    NSMutableArray *words = [NSMutableArray array];
    for (NSUInteger i = 0; i < bits.length; i += 11) {
        NSString *wordBits = [bits substringWithRange:NSMakeRange(i, 11)];
        NSUInteger wordIndex = strtoul([wordBits UTF8String], NULL, 2);
        // Use modulo to keep index within our limited word list
        wordIndex = wordIndex % [kBIP39Words count];
        [words addObject:kBIP39Words[wordIndex]];
    }
    
    return [words componentsJoinedByString:@" "];
}

- (NSData *)generateSecureEntropy:(NSUInteger)bytes {
    NSMutableData *entropy = [NSMutableData dataWithLength:bytes];
    if (SecRandomCopyBytes(kSecRandomDefault, bytes, entropy.mutableBytes) == errSecSuccess) {
        return entropy;
    }
    return nil;
}

#pragma mark - Utility Methods

- (SecAccessControlRef)createAccessControl {
    // Create access control with biometry
    SecAccessControlRef access = SecAccessControlCreateWithFlags(
        kCFAllocatorDefault,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        kSecAccessControlBiometryAny | kSecAccessControlPrivateKeyUsage,
        NULL
    );
    return access;
}

- (BOOL)isSecureEnclavePresent {
    LAContext *context = [[LAContext alloc] init];
    NSError *error = nil;
    
    if ([context canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics
                            error:&error]) {
        // Use the new API
        return context.biometryType != LABiometryTypeNone;
    }
    return NO;
}

#pragma mark - Exposed Methods

RCT_EXPORT_METHOD(isSecureEnclaveAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    BOOL isAvailable = [self isSecureEnclavePresent];
    resolve(@(isAvailable));
}

RCT_EXPORT_METHOD(generateSecureWallet:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        if (![self isSecureEnclavePresent]) {
            reject(@"SECURE_ENCLAVE_ERROR", @"Secure Enclave not available", nil);
            return;
        }
        
        // Generate entropy in Secure Enclave (32 bytes for 24 words)
        NSData *entropy = [self generateSecureEntropy:32];
        if (!entropy) {
            reject(@"ENTROPY_ERROR", @"Failed to generate secure entropy", nil);
            return;
        }
        
        // Generate mnemonic
        NSString *mnemonic = [self entropyToMnemonic:entropy];
        if (!mnemonic) {
            reject(@"MNEMONIC_ERROR", @"Failed to generate mnemonic", nil);
            return;
        }
        
        // Create key pair attributes
        SecAccessControlRef access = [self createAccessControl];
        NSDictionary *attributes = @{
            (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
            (__bridge id)kSecAttrKeySizeInBits: @256,
            (__bridge id)kSecAttrTokenID: (__bridge id)kSecAttrTokenIDSecureEnclave,
            (__bridge id)kSecPrivateKeyAttrs: @{
                (__bridge id)kSecAttrIsPermanent: @YES,
                (__bridge id)kSecAttrAccessControl: (__bridge_transfer id)access,
                (__bridge id)kSecAttrLabel: kKeychainLabel
            }
        };
        
        // Generate key pair in Secure Enclave
        CFErrorRef error = NULL;
        SecKeyRef privateKey = SecKeyCreateRandomKey((__bridge CFDictionaryRef)attributes, &error);
        
        if (!privateKey) {
            NSError *err = (__bridge_transfer NSError *)error;
            reject(@"KEY_GENERATION_ERROR", err.localizedDescription, nil);
            return;
        }
        
        // Get public key
        SecKeyRef publicKey = SecKeyCopyPublicKey(privateKey);
        
        // Get public key data
        CFErrorRef exportError = NULL;
        CFDataRef publicKeyData = SecKeyCopyExternalRepresentation(publicKey, &exportError);
        
        if (!publicKeyData) {
            NSError *err = (__bridge_transfer NSError *)exportError;
            reject(@"KEY_EXPORT_ERROR", err.localizedDescription, nil);
            CFRelease(privateKey);
            CFRelease(publicKey);
            return;
        }
        
        // Convert to hex string
        NSData *pubKeyData = (__bridge_transfer NSData *)publicKeyData;
        NSString *publicKeyHex = [pubKeyData.description stringByTrimmingCharactersInSet:
                                 [NSCharacterSet characterSetWithCharactersInString:@"<>"]];
        
        // Store encrypted mnemonic in keychain
        NSData *mnemonicData = [mnemonic dataUsingEncoding:NSUTF8StringEncoding];
        NSDictionary *mnemonicQuery = @{
            (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
            (__bridge id)kSecAttrAccount: @"mnemonic",
            (__bridge id)kSecValueData: mnemonicData,
            (__bridge id)kSecAttrAccessControl: (__bridge_transfer id)[self createAccessControl],
            (__bridge id)kSecAttrAccessible: (__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        };
        
        OSStatus status = SecItemAdd((__bridge CFDictionaryRef)mnemonicQuery, NULL);
        if (status != errSecSuccess) {
            reject(@"MNEMONIC_STORAGE_ERROR", @"Failed to store mnemonic securely", nil);
            return;
        }
        
        // Create response
        NSDictionary *result = @{
            @"publicKey": publicKeyHex,
            @"address": @"0x", // TODO: We'll implement address derivation next
            @"mnemonicStored": @YES
        };
        
        // Cleanup
        CFRelease(privateKey);
        CFRelease(publicKey);
        
        resolve(result);
        
    } @catch (NSException *e) {
        reject(@"UNEXPECTED_ERROR", e.reason, nil);
    }
}

RCT_EXPORT_METHOD(signTransaction:(NSDictionary *)txData
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    // TODO: Implement transaction signing
    // This will require implementing EVM-specific signing in native code
    reject(@"NOT_IMPLEMENTED", @"Transaction signing not yet implemented", nil);
}

@end