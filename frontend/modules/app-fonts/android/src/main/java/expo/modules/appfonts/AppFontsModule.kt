package expo.modules.appfonts

import android.content.res.AssetManager
import android.graphics.Typeface
import android.graphics.fonts.Font
import android.graphics.fonts.FontFamily
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import com.facebook.react.common.assets.ReactFontManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException

class AppFontsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppFonts")
    Constant("hasCascade") {
      val assets = appContext.reactContext?.assets
      if (Build.VERSION.SDK_INT < 29 || assets == null) return@Constant false
      try {
        register(assets, "AppMixedRegular", "Orbitron-Regular.ttf", "EliceDigitalBaeum_Regular.ttf")
        register(assets, "AppMixedBold", "Orbitron-Bold.ttf", "EliceDigitalBaeum_Bold.ttf")
        true
      } catch (error: IOException) {
        Log.w("AppFonts", "Could not load bundled font fallback", error)
        false
      }
    }
  }

  @RequiresApi(29)
  private fun register(assets: AssetManager, alias: String, latin: String, hangul: String) {
    fun family(file: String) = FontFamily.Builder(Font.Builder(assets, file).build()).build()
    val face = Typeface.CustomFallbackBuilder(family(latin))
      .addCustomFallback(family(hangul))
      .setSystemFallback("sans-serif")
      .build()
    ReactFontManager.getInstance().setTypeface(alias, Typeface.NORMAL, face)
  }
}
