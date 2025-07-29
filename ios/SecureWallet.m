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

// BIP39 wordlist (first few words for example)
static NSArray *const kBIP39Words = @[
    @"abandon", @"ability", @"able", @"about", @"above", @"absent", @"absorb", @"abstract",
    @"absurd", @"abuse", @"access", @"accident", @"account", @"accuse", @"achieve", @"acid"
    // ... full list would be here
];

#pragma mark - BIP39 Methods

- (NSString *)entropyToMnemonic:(NSData *)entropy {
    if (!entropy || entropy.length < 16 || entropy.length > 32 || entropy.length % 4 != 0) {
        RCTLogError(@"Invalid entropy length: %lu", (unsigned long)entropy.length);
        return nil;
    }
    
    // Calculate checksum
    uint8_t hash[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(entropy.bytes, (CC_LONG)entropy.length, hash);
    RCTLogInfo(@"Generated SHA256 hash for entropy");
    
    NSMutableString *bits = [NSMutableString string];
    
    // Convert entropy to bits
    const uint8_t *bytes = entropy.bytes;
    for (NSUInteger i = 0; i < entropy.length; i++) {
        for (int j = 7; j >= 0; j--) {
            [bits appendString:((bytes[i] >> j) & 1) ? @"1" : @"0"];
        }
    }
    RCTLogInfo(@"Converted entropy to bits, length: %lu", (unsigned long)bits.length);
    
    // Add checksum bits
    NSUInteger checksumBits = entropy.length / 4;
    for (NSUInteger i = 0; i < checksumBits; i++) {
        [bits appendString:((hash[0] >> (7 - i)) & 1) ? @"1" : @"0"];
    }
    RCTLogInfo(@"Added %lu checksum bits", (unsigned long)checksumBits);
    
    // Convert bits to words
    NSMutableArray *words = [NSMutableArray array];
    for (NSUInteger i = 0; i < bits.length; i += 11) {
        NSString *wordBits = [bits substringWithRange:NSMakeRange(i, 11)];
        NSUInteger wordIndex = strtoul([wordBits UTF8String], NULL, 2);
        // Use modulo to keep index within our limited word list
        wordIndex = wordIndex % [kBIP39Words count];
        [words addObject:kBIP39Words[wordIndex]];
        RCTLogInfo(@"Generated word %lu: %@", (unsigned long)words.count, kBIP39Words[wordIndex]);
    }
    
    NSString *mnemonic = [words componentsJoinedByString:@" "];
    RCTLogInfo(@"Final mnemonic length: %lu words", (unsigned long)words.count);
    return mnemonic;
}

- (NSData *)generateSecureEntropy:(NSUInteger)bytes {
    NSMutableData *entropy = [NSMutableData dataWithLength:bytes];
    int result = SecRandomCopyBytes(kSecRandomDefault, bytes, entropy.mutableBytes);
    if (result == errSecSuccess) {
        RCTLogInfo(@"Successfully generated %lu bytes of entropy", (unsigned long)bytes);
        return entropy;
    }
    RCTLogError(@"Failed to generate secure entropy, error: %d", result);
    return nil;
}

#pragma mark - Secure Enclave Methods

- (BOOL)isSecureEnclavePresent {
    LAContext *context = [[LAContext alloc] init];
    NSError *error = nil;
    
    if ([context canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&error]) {
        RCTLogInfo(@"Biometric authentication is available, type: %ld", (long)context.biometryType);
        return YES;
    }
    
    if (error) {
        RCTLogError(@"Biometric check error: %@", error);
    }
    return NO;
}

RCT_EXPORT_METHOD(isSecureEnclaveAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    resolve(@([self isSecureEnclavePresent]));
}

RCT_EXPORT_METHOD(generateSecureWallet:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    
    if (![self isSecureEnclavePresent]) {
        reject(@"secure_enclave_error", @"Secure Enclave not available", nil);
        return;
    }
    
    // Generate entropy for mnemonic
    NSData *entropy = [self generateSecureEntropy:16]; // 128 bits = 12 words
    if (!entropy) {
        reject(@"entropy_error", @"Failed to generate secure entropy", nil);
        return;
    }
    
    // Generate mnemonic
    NSString *mnemonic = [self entropyToMnemonic:entropy];
    if (!mnemonic) {
        reject(@"mnemonic_error", @"Failed to generate mnemonic", nil);
        return;
    }
    RCTLogInfo(@"Successfully generated mnemonic");
    
    // First, check if we already have a mnemonic stored
    NSDictionary *query = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"mnemonic",
        (__bridge id)kSecAttrService: @"com.walletpoc.secure",
        (__bridge id)kSecReturnData: @YES
    };
    
    CFTypeRef result = NULL;
    OSStatus checkStatus = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    if (checkStatus == errSecSuccess) {
        // Delete existing mnemonic
        RCTLogInfo(@"Found existing mnemonic, attempting to delete");
        OSStatus deleteStatus = SecItemDelete((__bridge CFDictionaryRef)query);
        if (deleteStatus != errSecSuccess) {
            RCTLogError(@"Failed to delete existing mnemonic, status: %d", (int)deleteStatus);
        }
    }
    
    // Store mnemonic in Keychain
    NSData *mnemonicData = [mnemonic dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary *addQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"mnemonic",
        (__bridge id)kSecValueData: mnemonicData,
        (__bridge id)kSecAttrAccessible: (__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        (__bridge id)kSecAttrService: @"com.walletpoc.secure"
    };
    
    OSStatus status = SecItemAdd((__bridge CFDictionaryRef)addQuery, NULL);
    if (status != errSecSuccess) {
        NSString *errorMessage = [NSString stringWithFormat:@"Failed to store mnemonic in Keychain. Status: %d", (int)status];
        RCTLogError(@"%@", errorMessage);
        
        // Log more details about the error
        switch(status) {
            case errSecDuplicateItem:
                RCTLogError(@"Item already exists in keychain");
                break;
            case errSecItemNotFound:
                RCTLogError(@"Item not found");
                break;
            case errSecAuthFailed:
                RCTLogError(@"Authorization/Authentication failed");
                break;
            case errSecDecode:
                RCTLogError(@"Unable to decode the provided data");
                break;
            case errSecParam:
                RCTLogError(@"One or more parameters passed to the function were not valid");
                break;
            default:
                RCTLogError(@"Unknown error occurred");
                break;
        }
        
        reject(@"keychain_error", errorMessage, nil);
        return;
    }
    
    RCTLogInfo(@"Successfully stored mnemonic in Keychain");
    
    // For now, return a placeholder
    resolve(@{
        @"address": @"0x1234567890123456789012345678901234567890",
        @"publicKey": @"placeholder_public_key"
    });
}

RCT_EXPORT_METHOD(signTransaction:(NSDictionary *)txData
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    // Placeholder for transaction signing
    reject(@"not_implemented", @"Transaction signing not yet implemented", nil);
}

@end