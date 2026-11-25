type Item = {position:readonly number[]; radius:number; ring?:boolean};
export function groupPreviewLayout(items: readonly Item[], aspect: number, fov = 50) {
  if (!items.length) return {center:[0,0,0] as [number,number,number],distance:3};
  const mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity];
  for (const item of items) for(let k=0;k<3;k++) {
    const extent=item.radius*(item.ring?2.2:1.15);
    mins[k]=Math.min(mins[k],item.position[k]-extent);maxs[k]=Math.max(maxs[k],item.position[k]+extent);
  }
  const center=mins.map((v,k)=>(v+maxs[k])/2) as [number,number,number];
  const half=maxs.map((v,k)=>(v-mins[k])/2);
  const tan=Math.tan(fov*Math.PI/360);
  // At most 76% of each axis: keep clear margins in a small card.
  const distance=Math.max(3,half[2]+Math.max(half[1]/tan,half[0]/(tan*Math.max(.1,aspect)))/.76);
  return {center,distance};
}
