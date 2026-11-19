Pod::Spec.new do |s|
  s.name = 'AppFonts'
  s.version = '1.0.0'
  s.summary = 'Native font fallback for the Star2day app'
  s.homepage = 'https://github.com/EJ-Koo/PBL1_'
  s.source = { :git => 'https://github.com/EJ-Koo/PBL1_.git' }
  s.author = 'Star2day'
  s.license = 'MIT'
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.static_framework = true
  s.source_files = '*.swift'
  s.dependency 'ExpoModulesCore'
end
