import ExpoModulesCore
import UIKit

// React Native looks up faces by name. Add a cascade only to the app's two
// Orbitron faces so UIKit also uses it for placeholders and composing text.
private extension UIFont {
  @objc static dynamic func appFont(named name: String, size: CGFloat) -> UIFont? {
    guard let font = appFont(named: name, size: size) else { return nil }
    let fallbackName: String
    switch name {
    case "Orbitron-Regular": fallbackName = "EliceDigitalBaeum"
    case "Orbitron-Bold": fallbackName = "EliceDigitalBaeum-Bd"
    default: return font
    }
    let fallback = UIFontDescriptor(name: fallbackName, size: size)
    let descriptor = font.fontDescriptor.addingAttributes([.cascadeList: [fallback]])
    return UIFont(descriptor: descriptor, size: size)
  }
}

enum AppFontCascade {
  static let installed: Bool = {
    guard let original = class_getClassMethod(UIFont.self, NSSelectorFromString("fontWithName:size:")),
          let replacement = class_getClassMethod(UIFont.self, #selector(UIFont.appFont(named:size:))) else {
      return false
    }
    method_exchangeImplementations(original, replacement)
    return true
  }()
}

public final class AppFontsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppFonts")
    Constant("hasCascade") { AppFontCascade.installed }
  }
}
