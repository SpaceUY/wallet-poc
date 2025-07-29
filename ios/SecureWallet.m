#import "SecureWallet.h"
#import <React/RCTLog.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <Security/Security.h>
#import <CommonCrypto/CommonCrypto.h>

@implementation SecureWallet {
    // Private instance variables if needed
}

#pragma mark - Private Methods

- (NSString *)formatPublicKey:(NSData *)publicKey {
    NSMutableString *hexString = [NSMutableString string];
    const unsigned char *bytes = publicKey.bytes;
    for (NSUInteger i = 0; i < publicKey.length; i++) {
        [hexString appendFormat:@"%02x", bytes[i]];
    }
    return hexString;
}

#pragma mark - Public Methods

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

#pragma mark - Verification Methods

- (BOOL)verifyKeyPairInSecureEnclave:(SecKeyRef)privateKey publicKey:(SecKeyRef)publicKey {
    // 1. Verify keys exist
    if (!privateKey || !publicKey) {
        RCTLogError(@"Key pair verification failed: One or both keys are nil");
        return NO;
    }
    
    // 2. Verify key attributes
    CFDictionaryRef privateAttrs = SecKeyCopyAttributes(privateKey);
    CFDictionaryRef publicAttrs = SecKeyCopyAttributes(publicKey);
    
    if (!privateAttrs || !publicAttrs) {
        RCTLogError(@"Failed to get key attributes");
        return NO;
    }
    
    // Convert public key to hex for logging
    CFDataRef logPubKeyData = SecKeyCopyExternalRepresentation(publicKey, NULL);
    if (logPubKeyData) {
        NSData *pubData = (__bridge_transfer NSData *)logPubKeyData;
        NSMutableString *hexString = [NSMutableString string];
        const unsigned char *bytes = pubData.bytes;
        for (NSUInteger i = 0; i < pubData.length; i++) {
            [hexString appendFormat:@"%02x", bytes[i]];
        }
        RCTLogInfo(@"Full public key (hex): %@", hexString);
        RCTLogInfo(@"First byte (should be 0x04 for uncompressed): %02x", bytes[0]);
        RCTLogInfo(@"X coordinate: %@", [hexString substringWithRange:NSMakeRange(2, 64)]);
        RCTLogInfo(@"Y coordinate: %@", [hexString substringWithRange:NSMakeRange(66, 64)]);
    }

    // Check if private key is in Secure Enclave
    CFStringRef tokenID = CFDictionaryGetValue(privateAttrs, kSecAttrTokenID);
    BOOL isInSecureEnclave = tokenID && CFEqual(tokenID, kSecAttrTokenIDSecureEnclave);
    RCTLogInfo(@"Private key is in Secure Enclave: %@", isInSecureEnclave ? @"YES" : @"NO");
    
    // Check key type and size
    CFStringRef keyType = CFDictionaryGetValue(privateAttrs, kSecAttrKeyType);
    CFNumberRef keySizeNum = CFDictionaryGetValue(privateAttrs, kSecAttrKeySizeInBits);
    
    BOOL isCorrectType = keyType && CFEqual(keyType, kSecAttrKeyTypeECSECPrimeRandom);
    int keySize = 0;
    CFNumberGetValue(keySizeNum, kCFNumberIntType, &keySize);
    
    RCTLogInfo(@"Key type is EC: %@", isCorrectType ? @"YES" : @"NO");
    RCTLogInfo(@"Key size: %d bits", keySize);
    
    // 3. Test signing operation
    NSData *testData = [@"test" dataUsingEncoding:NSUTF8StringEncoding];
    CFErrorRef error = NULL;
    CFDataRef signature = SecKeyCreateSignature(privateKey,
                                              kSecKeyAlgorithmECDSASignatureMessageX962SHA256,
                                              (__bridge CFDataRef)testData,
                                              &error);
    
    if (!signature) {
        NSError *err = (__bridge_transfer NSError *)error;
        RCTLogError(@"Signing test failed: %@", err);
        CFRelease(privateAttrs);
        CFRelease(publicAttrs);
        return NO;
    }
    
    // 4. Verify signature
    BOOL verified = SecKeyVerifySignature(publicKey,
                                        kSecKeyAlgorithmECDSASignatureMessageX962SHA256,
                                        (__bridge CFDataRef)testData,
                                        signature,
                                        &error);
    
    CFRelease(signature);
    CFRelease(privateAttrs);
    CFRelease(publicAttrs);
    
    if (!verified) {
        NSError *err = (__bridge_transfer NSError *)error;
        RCTLogError(@"Signature verification failed: %@", err);
        return NO;
    }
    
    RCTLogInfo(@"Key pair successfully verified with test signature");
    return YES;
}

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
    // First check if device has Secure Enclave by attempting to create a test key
    NSDictionary *testKeyParams = @{
        (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
        (__bridge id)kSecAttrKeySizeInBits: @256,
        (__bridge id)kSecAttrTokenID: (__bridge id)kSecAttrTokenIDSecureEnclave,
    };
    
    CFErrorRef error = NULL;
    SecKeyRef testKey = SecKeyCreateRandomKey((__bridge CFDictionaryRef)testKeyParams, &error);
    
    if (testKey) {
        // Clean up test key
        CFRelease(testKey);
        RCTLogInfo(@"Secure Enclave is present and working");
        
        // Now check biometric availability
        LAContext *context = [[LAContext alloc] init];
        NSError *biometricError = nil;
        
        if ([context canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&biometricError]) {
            RCTLogInfo(@"Biometric authentication is available, type: %ld", (long)context.biometryType);
            return YES;
        }
        
        if (biometricError) {
            RCTLogError(@"Biometric check error: %@", biometricError);
        }
        
    } else {
        NSError *keyError = (__bridge_transfer NSError *)error;
        RCTLogError(@"Failed to create test key in Secure Enclave: %@", keyError);
    }
    
    return NO;
}

RCT_EXPORT_METHOD(isSecureEnclaveAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    resolve(@([self isSecureEnclavePresent]));
}

#pragma mark - Keychain Methods

- (BOOL)deleteMnemonicFromKeychain {
    NSDictionary *query = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"mnemonic",
        (__bridge id)kSecAttrService: @"com.walletpoc.secure"
    };
    
    OSStatus status = SecItemDelete((__bridge CFDictionaryRef)query);
    if (status == errSecSuccess || status == errSecItemNotFound) {
        RCTLogInfo(@"Successfully deleted old mnemonic or none existed");
        return YES;
    }
    
    RCTLogError(@"Failed to delete old mnemonic, status: %d", (int)status);
    return NO;
}

- (BOOL)storeMnemonicInKeychain:(NSString *)mnemonic {
    // First delete any existing mnemonic
    if (![self deleteMnemonicFromKeychain]) {
        return NO;
    }
    
    NSData *mnemonicData = [mnemonic dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary *query = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"mnemonic",
        (__bridge id)kSecValueData: mnemonicData,
        (__bridge id)kSecAttrAccessible: (__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        (__bridge id)kSecAttrService: @"com.walletpoc.secure"
    };
    
    OSStatus status = SecItemAdd((__bridge CFDictionaryRef)query, NULL);
    if (status != errSecSuccess) {
        RCTLogError(@"Failed to store mnemonic in Keychain. Status: %d", (int)status);
        return NO;
    }
    
    RCTLogInfo(@"Successfully stored mnemonic in Keychain");
    return YES;
}

#pragma mark - Wallet Methods

- (BOOL)hasExistingWallet {
    // Check for mnemonic in Keychain
    NSDictionary *query = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"mnemonic",
        (__bridge id)kSecAttrService: @"com.walletpoc.secure",
        (__bridge id)kSecReturnData: @YES
    };
    
    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    BOOL hasMnemonic = (status == errSecSuccess);
    
    // Check for key pair in Secure Enclave
    NSDictionary *keyQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassKey,
        (__bridge id)kSecAttrLabel: kKeychainLabel,
        (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
        (__bridge id)kSecReturnRef: @YES
    };
    
    CFTypeRef keyResult = NULL;
    OSStatus keyStatus = SecItemCopyMatching((__bridge CFDictionaryRef)keyQuery, &keyResult);
    BOOL hasKeyPair = (keyStatus == errSecSuccess);
    
    if (keyResult) CFRelease(keyResult);
    if (result) CFRelease(result);
    
    RCTLogInfo(@"Wallet check - Has mnemonic: %@, Has key pair: %@", 
               hasMnemonic ? @"YES" : @"NO",
               hasKeyPair ? @"YES" : @"NO");
               
    return hasMnemonic && hasKeyPair;
}

- (NSDictionary *)getExistingWallet {
    // Get key pair from Secure Enclave
    NSDictionary *keyQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassKey,
        (__bridge id)kSecAttrLabel: kKeychainLabel,
        (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
        (__bridge id)kSecReturnRef: @YES
    };
    
    CFTypeRef keyResult = NULL;
    OSStatus keyStatus = SecItemCopyMatching((__bridge CFDictionaryRef)keyQuery, &keyResult);
    
    if (keyStatus != errSecSuccess) {
        RCTLogError(@"Failed to retrieve existing key pair, status: %d", (int)keyStatus);
        return nil;
    }
    
    SecKeyRef privateKey = (SecKeyRef)keyResult;
    SecKeyRef publicKey = SecKeyCopyPublicKey(privateKey);
    
    if (!publicKey) {
        CFRelease(privateKey);
        RCTLogError(@"Failed to get public key from existing private key");
        return nil;
    }
    
    // Get public key data
    CFErrorRef error = NULL;
    CFDataRef publicKeyData = SecKeyCopyExternalRepresentation(publicKey, &error);
    
    if (!publicKeyData) {
        CFRelease(privateKey);
        CFRelease(publicKey);
        RCTLogError(@"Failed to get public key data");
        return nil;
    }
    
    NSData *pubKeyData = (__bridge_transfer NSData *)publicKeyData;
    NSString *publicKeyHex = [self formatPublicKey:pubKeyData];
    
    NSDictionary *result = @{
        @"publicKey": publicKeyHex,
        @"address": @"0x0000000000000000000000000000000000000000" // Placeholder - will be derived in JS
    };
    
    CFRelease(privateKey);
    CFRelease(publicKey);
    
    return result;
}

RCT_EXPORT_METHOD(checkForExistingWallet:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    if ([self hasExistingWallet]) {
        RCTLogInfo(@"Found existing wallet, retrieving it");
        NSDictionary *existingWallet = [self getExistingWallet];
        if (existingWallet) {
            resolve(existingWallet);
            return;
        }
        RCTLogError(@"Found wallet but failed to retrieve it");
    }
    resolve(nil);
}

RCT_EXPORT_METHOD(generateSecureWallet:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    
    // First check if wallet already exists
    if ([self hasExistingWallet]) {
        RCTLogInfo(@"Wallet already exists, retrieving existing one");
        NSDictionary *existingWallet = [self getExistingWallet];
        if (existingWallet) {
            resolve(existingWallet);
            return;
        }
        // If we couldn't get the existing wallet, continue to create a new one
        RCTLogInfo(@"Failed to retrieve existing wallet, creating new one");
    }
    
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
    
    // Create key pair attributes
    SecAccessControlRef access = [self createAccessControl];
    if (!access) {
        reject(@"access_control_error", @"Failed to create access control", nil);
        return;
    }
    
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
        reject(@"key_generation_error", err.localizedDescription, nil);
        return;
    }
    
    // Get public key
    SecKeyRef publicKey = SecKeyCopyPublicKey(privateKey);
    
    // Verify key pair
    if (![self verifyKeyPairInSecureEnclave:privateKey publicKey:publicKey]) {
        CFRelease(privateKey);
        CFRelease(publicKey);
        reject(@"verification_error", @"Key pair verification failed", nil);
        return;
    }
    
    // Get public key data
    CFErrorRef exportError = NULL;
    CFDataRef publicKeyData = SecKeyCopyExternalRepresentation(publicKey, &exportError);
    
    if (!publicKeyData) {
        NSError *err = (__bridge_transfer NSError *)exportError;
        CFRelease(privateKey);
        CFRelease(publicKey);
        reject(@"key_export_error", err.localizedDescription, nil);
        return;
    }
    
    // Convert to hex string
    NSData *pubKeyData = (__bridge_transfer NSData *)publicKeyData;
    NSString *publicKeyHex = [self formatPublicKey:pubKeyData];
    
    RCTLogInfo(@"Public key length: %lu bytes", (unsigned long)pubKeyData.length);
    RCTLogInfo(@"Public key hex: %@", publicKeyHex);
    
    // Store mnemonic in Keychain
    if (![self storeMnemonicInKeychain:mnemonic]) {
        CFRelease(privateKey);
        CFRelease(publicKey);
        reject(@"keychain_error", @"Failed to store mnemonic in Keychain", nil);
        return;
    }
    
    NSDictionary *result = @{
        @"publicKey": publicKeyHex
    };
    
    // Cleanup
    CFRelease(privateKey);
    CFRelease(publicKey);
    
    resolve(result);
}

RCT_EXPORT_METHOD(signTransaction:(NSDictionary *)txData
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    // Placeholder for transaction signing
    reject(@"not_implemented", @"Transaction signing not yet implemented", nil);
}

RCT_EXPORT_METHOD(getMnemonic:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    NSDictionary *query = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"mnemonic",
        (__bridge id)kSecAttrService: @"com.walletpoc.secure",
        (__bridge id)kSecReturnData: @YES
    };
    
    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    
    if (status == errSecSuccess) {
        NSData *mnemonicData = (__bridge_transfer NSData *)result;
        NSString *mnemonic = [[NSString alloc] initWithData:mnemonicData encoding:NSUTF8StringEncoding];
        resolve(mnemonic);
    } else {
        reject(@"keychain_error", @"Failed to retrieve mnemonic", nil);
    }
}

RCT_EXPORT_METHOD(deleteWallet:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    // Delete mnemonic from Keychain
    NSDictionary *mnemonicQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"mnemonic",
        (__bridge id)kSecAttrService: @"com.walletpoc.secure"
    };
    
    OSStatus mnemonicStatus = SecItemDelete((__bridge CFDictionaryRef)mnemonicQuery);
    
    // Delete key pair from Secure Enclave
    NSDictionary *keyQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassKey,
        (__bridge id)kSecAttrLabel: kKeychainLabel,
        (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom
    };
    
    OSStatus keyStatus = SecItemDelete((__bridge CFDictionaryRef)keyQuery);
    
    if (mnemonicStatus == errSecSuccess || mnemonicStatus == errSecItemNotFound) {
        if (keyStatus == errSecSuccess || keyStatus == errSecItemNotFound) {
            RCTLogInfo(@"Successfully deleted wallet");
            resolve(@YES);
        } else {
            reject(@"delete_error", @"Failed to delete key pair", nil);
        }
    } else {
        reject(@"delete_error", @"Failed to delete mnemonic", nil);
    }
}

@end