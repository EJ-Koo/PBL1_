import {ActivityIndicator,Pressable,StyleSheet,View} from 'react-native';
import {Text} from '@/components/app-text';
import {DesignFonts} from '@/constants/ui-design';
import {useLanguage} from '@/lib/language';
import type {getResponsiveLayout} from '@/lib/responsive-layout';
import type {groupUniverseLayout} from '@/lib/group-universe-layout';
import {GroupReadAllIcon,GroupUniverseHeaderFrame,GroupUniverseIcon} from './group-universe-decoration';

export function GroupUniverseHeader({name,layout,geometry,onBack,onReadAll,onMembers,unread,busy=false,membersOpen=false,highlight}: {
  name:string;layout:ReturnType<typeof getResponsiveLayout>;geometry:ReturnType<typeof groupUniverseLayout>;
  onBack:()=>void;onReadAll:()=>void;onMembers:()=>void;unread:number;busy?:boolean;membersOpen?:boolean;highlight?:'read-all'|'members';
}) {
  const {t}=useLanguage(),s=layout.scale;
  return <>
    <View pointerEvents="none" style={[styles.titleFrame,{top:layout.headerTop,left:layout.chromeLeft,width:layout.chromeWidth,height:geometry.headerHeight}]}>
      <GroupUniverseHeaderFrame width={layout.chromeWidth} scale={s} titleWidth={geometry.titleWidth} titleHeight={geometry.titleHeight}/>
      <Text accessibilityRole="header" accessibilityLabel={name} numberOfLines={1} ellipsizeMode="tail"
        style={[styles.groupName,{left:(layout.chromeWidth-geometry.titleWidth)/2+8*s,width:geometry.titleWidth-16*s,top:3*s,fontSize:geometry.titleFontSize,lineHeight:Math.max(26,28*s)}]}>{name}</Text>
    </View>
    <View testID="group-header-controls" pointerEvents="box-none" style={[styles.controls,{top:geometry.controlsTop,left:layout.chromeLeft+18*s,width:layout.chromeWidth-36*s}]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('그룹으로 돌아가기')} onPress={onBack} style={styles.icon}>
        <GroupUniverseIcon kind="back" size={40*s}/>
      </Pressable>
      <View testID="group-header-right-controls" pointerEvents="box-none" style={[styles.rightControls,{gap:8*s}]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('모두 읽음')}
          accessibilityState={{disabled:busy||unread===0,busy}} aria-busy={busy} disabled={busy||unread===0} onPress={onReadAll}
          style={({pressed})=>[styles.readAll,{gap:7*s,paddingHorizontal:8*s,opacity:pressed?.6:1},unread===0&&styles.disabled]}>
          {busy?<ActivityIndicator size="small" color="#ddd"/>:<GroupReadAllIcon size={24*s} highlighted={highlight==='read-all'}/>}
          <Text style={[styles.readAllText,{fontSize:13*s,lineHeight:20*s},highlight==='read-all'&&{color:'#f6d879'}]}>{t('모두 읽음')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('그룹 멤버 목록')} accessibilityState={{expanded:membersOpen}} onPress={onMembers} style={styles.icon}>
          <GroupUniverseIcon kind="members" size={40*s} highlighted={highlight==='members'}/>
        </Pressable>
      </View>
    </View>
  </>;
}
const styles=StyleSheet.create({
  titleFrame:{position:'absolute'},groupName:{position:'absolute',color:'#fff',fontFamily:DesignFonts.bold,textAlign:'center',includeFontPadding:false},
  controls:{position:'absolute',zIndex:7,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  icon:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},rightControls:{flexDirection:'row',alignItems:'center',flexShrink:1},
  disabled:{opacity:.45},readAll:{flexDirection:'row',alignItems:'center',justifyContent:'center',minHeight:44,flexShrink:1},
  readAllText:{color:'#ddd',fontFamily:DesignFonts.regular,flexShrink:1},
});
