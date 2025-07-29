require 'json'

package = JSON.parse(File.read(File.join(__dir__, '../package.json')))

Pod::Spec.new do |s|
  s.name           = 'SecureWallet'
  s.version        = '1.0.0'
  s.summary        = 'Secure wallet implementation using iOS Secure Enclave'
  s.description    = 'Native module for secure key generation and storage using iOS Secure Enclave'
  s.homepage       = 'https://github.com/yourusername/wallet-poc'
  s.license        = { :type => 'MIT', :text => 'MIT License' }
  s.author         = { 'Your Name' => 'your.email@example.com' }
  s.platform       = :ios, '15.1'
  s.source         = { :git => 'https://github.com/yourusername/wallet-poc.git', :tag => s.version.to_s }
  s.source_files   = '*.{h,m,c}'
  s.requires_arc   = true
  s.dependency 'React-Core'
end