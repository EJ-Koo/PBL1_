import { View } from 'react-native';
import { Text } from '@/components/app-text';
import { Avatar } from '@/components/ui/group-profile-control';
import { chatTimestamp } from '@/lib/group-chat';

/** Presentation only; practice chat uses the same dates and spacing without social APIs. */
export function GroupChatMessage({name,body,createdAt,previousAt,avatar,scale=1,language='ko'}:{
  name:string;body:string;createdAt:string;previousAt?:string;avatar?:string|null;scale?:number;language?:string;
}) {
  const stamp=chatTimestamp(createdAt,language);
  const separator=stamp.day!==null&&stamp.day!==chatTimestamp(previousAt??'',language).day;
  return <View style={{gap:10*scale}}>
    {separator&&<Text testID="group-chat-date" style={{color:'#dddde8',fontSize:11*scale,lineHeight:17*scale,textAlign:'center'}}>{stamp.date}</Text>}
    <View style={{flexDirection:'row',gap:12*scale,minHeight:40*scale,alignItems:'flex-start'}}>
      {avatar?<Avatar uri={avatar} size={40*scale}/>:<View style={{width:40*scale,height:40*scale,borderRadius:20*scale,backgroundColor:'#d9d9d9'}}/>}
      <View style={{flex:1,minWidth:0,gap:3*scale}}>
        <View style={{flexDirection:'row',alignItems:'baseline',gap:8*scale,flexWrap:'wrap'}}>
          <Text style={{color:'#fff',fontSize:12*scale,lineHeight:18*scale,flexShrink:1}}>{name}</Text>
          {!!stamp.time&&<Text testID="group-chat-time" style={{color:'#b7bac5',fontSize:10*scale,lineHeight:16*scale}}>{stamp.time}</Text>}
        </View>
        <Text style={{color:'#fff',fontSize:13*scale,lineHeight:21*scale,paddingRight:8*scale}} selectable>{body}</Text>
      </View>
    </View>
  </View>;
}
