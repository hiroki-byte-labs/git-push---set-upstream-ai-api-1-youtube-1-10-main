// 場面画像の描画（AppKit）。入力は <job-dir>/plan.json（台本v2）と render-spec.json（src/timeline.ts が作る区間仕様）。
// 出力は区間ごとのPNGと render-report.json（文字の大きさ・入れ物の枠と描いた位置・コントラスト比）。収まらない文字があれば終了コード1。
// T106: 文字は「入れ物の枠（box）」を決めてから計測し、枠の中で上下中央（または上寄せ）に置く。旧方式（固定の高さ100の枠の上端から描く）は
// 番号が枠の外へ出る、1行の字幕が枠の上に寄る、字幕枠がフッターに重なる等の文字ずれの原因だった。
import Foundation
import AppKit
import CoreVideo

// 台本形式v2（src/plan.ts）。図解は種別ごとに使う欄が異なるため任意項目にする。
struct Cue: Codable { let text:String; let seconds:Double }
struct Bar: Codable { let label:String; let value:Double }
struct Diagram: Codable { let type:String; let items:[String]?; let left:String?; let right:String?; let leftItems:[String]?; let rightItems:[String]?; let value:String?; let label:String?; let note:String?; let question:String?; let yes:String?; let no:String?; let bars:[Bar]?; let total:String?; let motion:String? }
struct Scene: Codable { let title:String; let narration:String; let cues:[Cue]; let diagram:Diagram; let seconds:Int; let chapter:String?; let fictional:Bool?; let sources:[String]; let emphasis:[String]?; let role:String? }
struct Source: Codable { let id:String; let title:String }
struct Production: Codable { let mode:String; let project:String }
struct Plan: Codable { let schema:Int; let id:String; let title:String; let version:Int; let scenes:[Scene]; let sources:[Source]; let theme:String?; let production:Production? }
struct RenderFrame: Codable { let file:String; let scene:Int; let step:Int; let cue:Int?; let fade:Double?; let highlight:Bool?; let motion:Double? }
struct ThumbSpec: Codable { let file:String; let variant:String; let headline:String; let sub:String; let scene:Int; let keyword:String?; let contrast:[String]? }
struct ThumbRecord: Codable { let file:String; let variant:String; let headlineSize:Double; let fitted:Bool; let contrast:Double }
struct RenderSpec: Codable { let fps:Int; let subtitles:String; let frames:[RenderFrame]; let thumbnails:[ThumbSpec]?; let scale:Double? }
// box: 入れ物の枠、drawn: 実際に描いた文字の外接矩形（どちらも1280×720の論理座標、左下原点）。zone: 画面上の区画（重なりの検査に使う。src/layout.ts）。
struct FitRecord: Codable { let file:String; let role:String; let text:String; let size:Double; let maxSize:Double; let fitted:Bool; let pixelSize:Double; let contrast:Double; let zone:String; let box:[Double]; let drawn:[Double]; let align:String }

func fail(_ message:String)->Never { fputs(message+"\n",stderr);exit(1) }
guard CommandLine.arguments.count==2 else { fail("usage: render <job-dir>") }
let dir=URL(fileURLWithPath:CommandLine.arguments[1])
let plan=try JSONDecoder().decode(Plan.self,from:Data(contentsOf:dir.appendingPathComponent("plan.json")))
let spec=try JSONDecoder().decode(RenderSpec.self,from:Data(contentsOf:dir.appendingPathComponent("render-spec.json")))
// 座標は1280×720の論理座標で書き、scale倍の画素で描く（T091: 1080pはscale=1.5）。
let scale=CGFloat(spec.scale ?? 1)
let w=Int(1280*scale),h=Int(720*scale)
func color(_ r:CGFloat,_ g:CGFloat,_ b:CGFloat)->NSColor {NSColor(srgbRed:r/255,green:g/255,blue:b/255,alpha:1)}
let dark0=color(12,22,38)
let accent=color(81,212,184),muted=color(160,177,197),panel=color(27,46,67),subBg=color(20,34,52)
var records:[FitRecord]=[]
// 最新の段の描画状態（T079）と動きの進み具合（T106、0〜1）。frame()の中で設定する。
var curFade:CGFloat=1, curHighlight=false, curMotion:CGFloat=1
var currentFile=""

// 画面の区画（T106）。区画どうしは重ならない。
let ZONE_HEADER=NSRect(x:60,y:618,width:1160,height:44)
let ZONE_TITLE=NSRect(x:60,y:520,width:1160,height:92)
let ZONE_EMPH=NSRect(x:60,y:466,width:1160,height:40)
let ZONE_DIAGRAM=NSRect(x:60,y:235,width:1160,height:220)
let ZONE_SUB=NSRect(x:45,y:92,width:1190,height:128)
let ZONE_FOOTER=NSRect(x:60,y:22,width:1160,height:36)

func rect(_ r:NSRect,_ c:NSColor,_ radius:CGFloat=18){c.setFill();NSBezierPath(roundedRect:r,xRadius:radius,yRadius:radius).fill()}
func attributes(_ size:CGFloat,_ c:NSColor,_ align:NSTextAlignment = .left,_ weight:NSFont.Weight = .medium)->[NSAttributedString.Key:Any] {
 let p=NSMutableParagraphStyle();p.lineBreakMode = .byWordWrapping;p.alignment=align
 return [.font:NSFont.systemFont(ofSize:size,weight:weight),.foregroundColor:c,.paragraphStyle:p]
}
func measure(_ value:String,_ size:CGFloat,_ width:CGFloat,_ weight:NSFont.Weight = .medium)->NSSize {
 let r=(value as NSString).boundingRect(with:NSSize(width:width,height:10000),options:[.usesLineFragmentOrigin],attributes:attributes(size,.white,.left,weight))
 return NSSize(width:ceil(r.width),height:ceil(r.height))
}
enum VAlign { case center, top }
// 入れ物の枠（box）に文字を収めて描く。収まらなければminScaleまで1ptずつ縮め、それでも超えれば不合格として記録する（T043の規則を維持）。
// 上下は中央（既定）か上寄せ、左右は左・中央・右揃え。描いた外接矩形を記録し、枠からのはみ出しと中央からのずれを検査できるようにする。
@discardableResult
func boxText(_ zone:String,_ role:String,_ value:String,_ box:NSRect,_ maxSize:CGFloat,_ c:NSColor,align:NSTextAlignment = .left,v:VAlign = .center,bg:NSColor=dark0,minScale:CGFloat=0.6,weight:NSFont.Weight = .medium)->CGFloat {
 let minSize=(maxSize*minScale).rounded()
 var size=maxSize
 while size>minSize && measure(value,size,box.width,weight).height>box.height { size-=1 }
 let m=measure(value,size,box.width,weight)
 let fitted=m.height<=box.height+0.5
 let y = v == .center ? box.minY+(box.height-m.height)/2 : box.maxY-m.height
 let tw=min(m.width,box.width)
 let x = align == .center ? box.midX-tw/2 : align == .right ? box.maxX-tw : box.minX
 (value as NSString).draw(in:NSRect(x:box.minX,y:y-1,width:box.width,height:m.height+1),withAttributes:attributes(size,c,align,weight))
 records.append(FitRecord(file:currentFile,role:role,text:value,size:Double(size),maxSize:Double(maxSize),fitted:fitted,pixelSize:Double(size*scale),contrast:contrast(c,bg),zone:zone,
  box:[box.minX,box.minY,box.width,box.height].map{Double($0)},drawn:[x,y,tw,m.height].map{Double($0)},align: v == .top ? "top" : "center"))
 return size
}
// 札（架空の例・本人の考察など）。文字の幅に合わせた角丸の枠の中央に置く。右端から左へ並べ、次の右端を返す。
@discardableResult
func badge(_ label:String,right:CGFloat,_ zone:NSRect,fill:NSColor=panel,fg:NSColor=accent)->CGFloat {
 let size:CGFloat=19
 let bw=measure(label,size,600).width+32,bh:CGFloat=32
 let r=NSRect(x:right-bw,y:zone.midY-bh/2,width:bw,height:bh)
 rect(r,fill,16)
 boxText("header","札",label,r.insetBy(dx:16,dy:4),size,fg,align:.center,bg:fill,minScale:1)
 return r.minX-12
}
// 最新の段をフェードで描き、強調中なら縁取りする（T079）。
func newest(_ isNewest:Bool,_ box:NSRect,_ draw:()->Void){
 guard isNewest, let cg=NSGraphicsContext.current?.cgContext else { draw(); return }
 cg.saveGState();cg.setAlpha(curFade);draw();cg.restoreGState()
 if curHighlight && box != .zero {accent.setStroke();let p=NSBezierPath(roundedRect:box.insetBy(dx:-4,dy:-4),xRadius:20,yRadius:20);p.lineWidth=3;p.stroke()}
}
func fits(_ value:String,_ size:CGFloat,_ width:CGFloat,_ maxHeight:CGFloat)->Bool { measure(value,size,width).height<=maxHeight }
// 出典番号: 場面での初出順、続いて未参照の出典（src/metadata.ts sourceRecords と同じ規則）。
func sourceNumber(_ id:String)->Int {
 var order:[String]=[]
 for s in plan.scenes { for x in s.sources where !order.contains(x) { order.append(x) } }
 for x in plan.sources where !order.contains(x.id) { order.append(x.id) }
 return (order.firstIndex(of:id) ?? 0)+1
}
func chapterLabel(_ sceneIndex:Int,_ title:String)->String {
 var n=0,prev:String?=nil
 for s in plan.scenes[0...sceneIndex] { if s.chapter != prev {n+=1;prev=s.chapter} }
 return "第\(n)章  \(title)"
}
// 矢印（線と矢じり）。progressが1未満なら線を途中まで描き、先端に丸を置く（T106: 原因→結果・経緯を示す動き）。
func arrowLine(_ a:NSPoint,_ b:NSPoint,progress p:CGFloat=1){
 let tip=NSPoint(x:a.x+(b.x-a.x)*p,y:a.y+(b.y-a.y)*p)
 accent.setStroke();let line=NSBezierPath();line.move(to:a);line.line(to:tip);line.lineWidth=4;line.lineCapStyle = .round;line.stroke()
 if p<1 { accent.setFill();NSBezierPath(ovalIn:NSRect(x:tip.x-9,y:tip.y-9,width:18,height:18)).fill(); return }
 let head=NSBezierPath();head.move(to:NSPoint(x:b.x+2,y:b.y));head.line(to:NSPoint(x:b.x-12,y:b.y+9));head.line(to:NSPoint(x:b.x-12,y:b.y-9));head.close();accent.setFill();head.fill()
}

// 図解。stepまでの要素だけを描く（段階表示）。座標はAppKitの左下原点。すべてZONE_DIAGRAMの中に置く。
func drawFlow(_ d:Diagram,_ step:Int){
 let items=d.items ?? []
 let travel = d.motion=="travel"
 let n=CGFloat(items.count),gap:CGFloat = travel ? 72 : 48,bw=(1160-gap*(n-1))/n
 let by:CGFloat=280,bh:CGFloat=130
 for (i,label) in items.enumerated() where i<step {
  let x=60+CGFloat(i)*(bw+gap)
  let isNew = i==step-1
  // 経緯の動き（T106）: 新しい段は、前の段からの矢印が伸び切るのに合わせて現れる。
  if i>0 {
   let a=NSPoint(x:x-gap+10,y:by+bh/2),b=NSPoint(x:x-10,y:by+bh/2)
   arrowLine(a,b,progress: isNew && travel ? curMotion : 1)
  }
  let box=NSRect(x:x,y:by,width:bw,height:bh)
  let draw={
   rect(box,panel)
   boxText("diagram","図解番号",String(format:"%02d",i+1),NSRect(x:x+18,y:by+bh-14-24,width:60,height:24),19,accent,bg:panel,minScale:1)
   boxText("diagram","図解",label,NSRect(x:x+18,y:by+14,width:bw-36,height:bh-14-24-14-6),25,.white,bg:panel)
  }
  if isNew && travel && i>0, let cg=NSGraphicsContext.current?.cgContext {
   cg.saveGState();cg.setAlpha(curMotion);draw();cg.restoreGState()
   if curHighlight {accent.setStroke();let p=NSBezierPath(roundedRect:box.insetBy(dx:-4,dy:-4),xRadius:20,yRadius:20);p.lineWidth=3;p.stroke()}
  } else { newest(isNew,box,draw) }
 }
}
// 項目を縦に並べ、まとまりとして枠の上下中央に置く。収まらなければ全体の文字を縮める。
func stacked(_ role:String,_ texts:[String],_ area:NSRect,_ maxSize:CGFloat,_ c:NSColor,gap:CGFloat=8,bg:NSColor){
 var size=maxSize
 func heights(_ s:CGFloat)->[CGFloat] { texts.map{measure($0,s,area.width).height} }
 while size>(maxSize*0.6).rounded() && heights(size).reduce(0,+)+gap*CGFloat(max(0,texts.count-1))>area.height { size-=1 }
 let hs=heights(size),total=hs.reduce(0,+)+gap*CGFloat(max(0,texts.count-1))
 var top=area.midY+total/2
 for (k,t) in texts.enumerated(){
  boxText("diagram",role,t,NSRect(x:area.minX,y:top-hs[k],width:area.width,height:hs[k]),size,c,bg:bg,minScale:1)
  top-=hs[k]+gap
 }
}
func drawCompare(_ d:Diagram,_ step:Int){
 let cols:[(String,[String])]=[(d.left ?? "",d.leftItems ?? []),(d.right ?? "",d.rightItems ?? [])]
 for (i,col) in cols.enumerated() where i<step {
  let x=60+CGFloat(i)*600
  let box=NSRect(x:x,y:245,width:560,height:200)
  newest(i==step-1,box){
   rect(box,panel)
   boxText("diagram","図解見出し",col.0,NSRect(x:x+24,y:445-16-40,width:512,height:40),27,accent,bg:panel)
   muted.withAlphaComponent(0.35).setFill();NSRect(x:x+24,y:445-16-40-8,width:512,height:1).fill()
   stacked("図解",col.1,NSRect(x:x+24,y:245+16,width:512,height:200-16-40-8-16-8),24,.white,bg:panel)
  }
 }
 if step>=2 {newest(step==2,NSRect.zero){boxText("diagram","記号","⇔",NSRect(x:620,y:245,width:40,height:200),30,accent,align:.center,minScale:1)}}
}
func drawNumber(_ d:Diagram){
 let box=NSRect(x:60,y:245,width:1160,height:200)
 newest(true,box){
  rect(box,panel)
  boxText("diagram","数値",d.value ?? "",NSRect(x:100,y:265,width:360,height:160),72,accent,bg:panel)
  var texts=[d.label ?? ""]; if let note=d.note {texts.append(note)}
  // 見出しと補足は大きさが違うので、まとまりの高さを測って上下中央に置く。
  let area=NSRect(x:480,y:265,width:700,height:160)
  let lh=measure(texts[0],32,area.width).height, nh=texts.count>1 ? measure(texts[1],24,area.width).height : 0
  let total=lh+(texts.count>1 ? 12+nh : 0)
  let top=area.midY+total/2
  boxText("diagram","図解見出し",texts[0],NSRect(x:area.minX,y:top-lh,width:area.width,height:lh),32,.white,bg:panel,minScale:1)
  if texts.count>1 {boxText("diagram","図解",texts[1],NSRect(x:area.minX,y:top-lh-12-nh,width:area.width,height:nh),24,muted,bg:panel,minScale:1)}
 }
}
func drawBranch(_ d:Diagram,_ step:Int){
 let q=NSRect(x:60,y:375,width:1160,height:70)
 newest(step==1,q){
  rect(q,panel)
  boxText("diagram","図解見出し",d.question ?? "",q.insetBy(dx:30,dy:8),30,.white,bg:panel)
 }
 if step>=2 {
  newest(true,NSRect(x:60,y:245,width:1160,height:110)){
   for (k,(tag,ans)) in [("はい",d.yes ?? ""),("いいえ",d.no ?? "")].enumerated() {
    let x:CGFloat=60+CGFloat(k)*600
    rect(NSRect(x:x,y:245,width:560,height:110),panel)
    boxText("diagram","図解札",tag,NSRect(x:x+24,y:355-12-26,width:140,height:26),20,accent,bg:panel,minScale:1)
    boxText("diagram","図解",ans,NSRect(x:x+24,y:245+12,width:512,height:110-12-26-12-6),25,.white,bg:panel)
   }
  }
 }
}
// 集計の図（T106、type=meter）: 品目ごとの変化の棒が順に伸び、最後に「まとめると」の棒（平均）が伸びる。
// 「多くの品目の動きを一つにまとめる」といった集計の意味を、動きで示す。値は−1〜1の相対値で、数値は表示しない。
func direction(_ v:Double)->String { abs(v)<0.15 ? "変わらない" : v>0 ? "上がった" : "下がった" }
func drawMeter(_ d:Diagram,_ step:Int){
 let bars=d.bars ?? []
 let box=NSRect(x:60,y:245,width:1160,height:200)
 rect(box,panel)
 let rows=CGFloat(bars.count+1),rowH=(200-24)/rows
 let zeroX:CGFloat=720,half:CGFloat=300
 // 基準線（変化なし）
 muted.withAlphaComponent(0.5).setFill();NSRect(x:zeroX-1,y:257,width:2,height:176).fill()
 func row(_ k:Int,_ label:String,_ value:Double,isTotal:Bool){
  let y=445-12-rowH*CGFloat(k+1)
  let isNew = k==step-1
  let p:CGFloat = isNew ? curMotion : 1
  let len=CGFloat(value)*half*p
  let barH=min(rowH-12,26)
  let barRect=NSRect(x:min(zeroX,zeroX+len),y:y+(rowH-barH)/2,width:abs(len),height:barH)
  if isTotal { muted.withAlphaComponent(0.35).setFill();NSRect(x:84,y:y+rowH-2,width:1112,height:1).fill() }
  boxText("diagram",isTotal ? "図解見出し" : "図解",label,NSRect(x:84,y:y+3,width:280,height:rowH-6),isTotal ? 24 : 22,isTotal ? accent : .white,bg:panel)
  rect(barRect,isTotal ? accent : muted,6)
  if p>=1 { boxText("diagram","図解",direction(value),NSRect(x:1060,y:y+3,width:140,height:rowH-6),19,isTotal ? accent : muted,align:.right,bg:panel,minScale:1) }
 }
 for (k,b) in bars.enumerated() where k<step { row(k,b.label,b.value,isTotal:false) }
 if step>bars.count {
  let mean=bars.map{$0.value}.reduce(0,+)/Double(max(1,bars.count))
  row(bars.count,d.total ?? "まとめると",mean,isTotal:true)
 }
}
func drawDiagram(_ d:Diagram,_ step:Int){
 switch d.type {
  case "flow": drawFlow(d,step)
  case "compare": drawCompare(d,step)
  case "number": drawNumber(d)
  case "branch": drawBranch(d,step)
  case "meter": drawMeter(d,step)
  default: fail("未対応の図解: \(d.type)")
 }
}

// サムネイル用の大きな図解（T106）。一覧表示（幅300px前後）でも形と短い語が読めるよう、要素を減らして大きく描く。範囲は y=110〜470。
func drawThumbDiagram(_ d:Diagram){
 let area=NSRect(x:60,y:110,width:1160,height:360)
 switch d.type {
  case "meter":
   let bars=Array((d.bars ?? []).prefix(4))
   let mean=(d.bars ?? []).map{$0.value}.reduce(0,+)/Double(max(1,(d.bars ?? []).count))
   let rows=bars.map{($0.label,$0.value,false)}+[(d.total ?? "まとめると",mean,true)]
   let rowH=area.height/CGFloat(rows.count),zeroX:CGFloat=640,half:CGFloat=420
   muted.withAlphaComponent(0.5).setFill();NSRect(x:zeroX-2,y:area.minY,width:4,height:area.height).fill()
   for (k,r) in rows.enumerated() {
    let y=area.maxY-rowH*CGFloat(k+1)
    boxText("thumb","サムネイル補足",r.0,NSRect(x:60,y:y+4,width:220,height:rowH-8),40,r.2 ? accent : .white,weight:.bold)
    let len=CGFloat(r.1)*half,bh=rowH*0.55
    rect(NSRect(x:min(zeroX,zeroX+len),y:y+(rowH-bh)/2,width:abs(len),height:bh),r.2 ? accent : muted,8)
   }
  case "flow":
   let items=Array((d.items ?? []).prefix(3)),n=CGFloat(items.count),gap:CGFloat=70,bw=(1160-gap*(n-1))/n
   for (i,it) in items.enumerated() {
    let b=NSRect(x:60+CGFloat(i)*(bw+gap),y:area.minY+60,width:bw,height:240)
    rect(b,i==items.count-1 ? accent : panel,24)
    boxText("thumb","サムネイル補足",it,b.insetBy(dx:24,dy:24),52,i==items.count-1 ? dark0 : .white,align:.center,bg:i==items.count-1 ? accent : panel,weight:.bold)
    if i>0 {arrowLine(NSPoint(x:b.minX-gap+12,y:b.midY),NSPoint(x:b.minX-12,y:b.midY))}
   }
  case "number":
   boxText("thumb","サムネイル補足",d.value ?? "",NSRect(x:60,y:area.minY,width:560,height:area.height),150,accent,weight:.heavy)
   boxText("thumb","サムネイル補足",d.label ?? "",NSRect(x:640,y:area.minY,width:580,height:area.height),52,.white,weight:.bold)
  case "branch":
   boxText("thumb","サムネイル補足",d.question ?? "",area,64,.white,align:.center,weight:.bold)
  default:
   let l=NSRect(x:60,y:area.minY+40,width:540,height:280),r=NSRect(x:680,y:area.minY+40,width:540,height:280)
   rect(l,panel,24);rect(r,accent,24)
   boxText("thumb","サムネイル補足",d.left ?? "",l.insetBy(dx:30,dy:30),60,.white,align:.center,bg:panel,weight:.bold)
   boxText("thumb","サムネイル補足",d.right ?? "",r.insetBy(dx:30,dy:30),60,dark0,align:.center,bg:accent,weight:.bold)
 }
}

func makeContext()->(CGContext,CVPixelBuffer) {
 var buffer:CVPixelBuffer?;let status=CVPixelBufferCreate(kCFAllocatorDefault,w,h,kCVPixelFormatType_32ARGB,[kCVPixelBufferCGImageCompatibilityKey:true,kCVPixelBufferCGBitmapContextCompatibilityKey:true] as CFDictionary,&buffer)
 guard status==kCVReturnSuccess,let b=buffer else { fail("CVPixelBufferCreate failed: \(status)") };CVPixelBufferLockBaseAddress(b,[])
 let ctx=CGContext(data:CVPixelBufferGetBaseAddress(b),width:w,height:h,bitsPerComponent:8,bytesPerRow:CVPixelBufferGetBytesPerRow(b),space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.noneSkipFirst.rawValue)!
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:ctx,flipped:false);ctx.scaleBy(x:scale,y:scale)
 return (ctx,b)
}
func finish(_ ctx:CGContext,_ b:CVPixelBuffer)->CGImage { let r=ctx.makeImage()!;NSGraphicsContext.restoreGraphicsState();CVPixelBufferUnlockBaseAddress(b,[]);return r }

func frame(_ f:RenderFrame)->CGImage {
 let scene=plan.scenes[f.scene]
 curFade=CGFloat(f.fade ?? 1);curHighlight=f.highlight ?? false;curMotion=CGFloat(f.motion ?? 1)
 let (ctx,b)=makeContext()
 dark0.setFill();NSRect(x:0,y:0,width:1280,height:720).fill()
 // 見出し行: 章（T080）かテーマの札（T103）、右に札（架空の例・本人の考察）。
 var right=ZONE_HEADER.maxX
 if scene.fictional == true { right=badge("架空の例",right:right,ZONE_HEADER) }
 if scene.role == "reflection" { right=badge(plan.production?.mode=="production" ? "本人の考察" : "デモ: 仮の考察（本人ではない）",right:right,ZONE_HEADER,fill:accent,fg:dark0) }
 let headerLabel = scene.chapter.map{chapterLabel(f.scene,$0)} ?? (plan.theme=="general" ? "DAILY KNOWLEDGE   /   LOCAL DEMO" : "INVESTMENT × PSYCHOLOGY   /   LOCAL DEMO")
 boxText("header","章",headerLabel,NSRect(x:ZONE_HEADER.minX,y:ZONE_HEADER.minY,width:right-ZONE_HEADER.minX-12,height:ZONE_HEADER.height),21,accent)
 boxText("title","見出し",scene.title,ZONE_TITLE,44,.white)
 // キーワード強調（T078）。字幕の有無によらず見出しの下の行に置き、字幕・図解と重ねない（T106）。
 if let words=scene.emphasis, !words.isEmpty {
  var x=ZONE_EMPH.minX
  for word in words {
   let cw=measure(word,20,600).width+32
   let chip=NSRect(x:x,y:ZONE_EMPH.minY+2,width:cw,height:36)
   rect(chip,panel,18)
   accent.setStroke();let border=NSBezierPath(roundedRect:chip.insetBy(dx:1,dy:1),xRadius:17,yRadius:17);border.lineWidth=2;border.stroke()
   boxText("emphasis","強調",word,chip.insetBy(dx:16,dy:4),20,accent,align:.center,bg:panel,minScale:1)
   x+=cw+14
  }
 }
 drawDiagram(scene.diagram,f.step)
 // 焼き込み字幕（T044、T106で既定）。枠の上下中央・左右中央に置く。
 if let cue=f.cue {
  rect(ZONE_SUB,subBg)
  boxText("subtitle","字幕",scene.cues[cue].text,ZONE_SUB.insetBy(dx:25,dy:10),30,.white,align:.center,bg:subBg)
 }
 muted.withAlphaComponent(0.6).setFill();NSRect(x:60,y:72,width:1160,height:2).fill()
 boxText("footer","フッター","音声：自作の確認音 / ナレーション未接続",NSRect(x:60,y:ZONE_FOOTER.minY,width:400,height:ZONE_FOOTER.height),17,muted,minScale:1)
 // 場面の出典（T072）。題名が収まらなければ、概要欄の出典番号で示す。
 if !scene.sources.isEmpty {
  let titles=scene.sources.compactMap{id in plan.sources.first{$0.id==id}?.title}
  let full="出典: "+titles.joined(separator:" / ")
  let short="出典: 概要欄 "+scene.sources.map{"[\(sourceNumber($0))]"}.joined()
  boxText("footer","出典",fits(full,17,600,24) ? full : short,NSRect(x:480,y:ZONE_FOOTER.minY,width:600,height:ZONE_FOOTER.height),17,muted)
 }
 boxText("footer","フッター","\(f.scene+1) / \(plan.scenes.count)",NSRect(x:1100,y:ZONE_FOOTER.minY,width:120,height:ZONE_FOOTER.height),20,muted,align:.right,minScale:1)
 return finish(ctx,b)
}

// WCAGの相対輝度とコントラスト比（T073、T091）。
func luminance(_ c:NSColor)->Double {
 let s=c.usingColorSpace(.sRGB)!
 func ch(_ v:CGFloat)->Double {let x=Double(v);return x<=0.03928 ? x/12.92 : pow((x+0.055)/1.055,2.4)}
 return 0.2126*ch(s.redComponent)+0.7152*ch(s.greenComponent)+0.0722*ch(s.blueComponent)
}
func contrast(_ a:NSColor,_ b:NSColor)->Double {let (l1,l2)=(luminance(a),luminance(b));return (max(l1,l2)+0.05)/(min(l1,l2)+0.05)}

// サムネイル（T073、T106で再設計）。顔・アバターは使わない。参考動画の観察（docs/T106-DESIGN.md）から「短い見出し・一つの対比・一色の強調」を原則にした独自案。
// a=問い型（大きな見出し＋キーワードの円）、b=図解型（見出し＋台本の図解）、c=対比型（二つの見方を左右に置く）。1280×720。
func thumbnail(_ t:ThumbSpec)->(CGImage,ThumbRecord) {
 let (ctx,b)=makeContext()
 currentFile=t.file
 curFade=1;curHighlight=false;curMotion=1
 dark0.setFill();NSRect(x:0,y:0,width:1280,height:720).fill()
 var size:CGFloat=0
 // 見出しの改行（\n）は問い型（a）だけで使い、横長の枠のb・cでは1行にする（T106）。
 let oneLine=t.headline.replacingOccurrences(of:"\n",with:"")
 switch t.variant {
  case "b":
   let scene=plan.scenes[t.scene]
   size=boxText("thumb","サムネイル見出し",oneLine,NSRect(x:60,y:500,width:1160,height:180),96,.white,weight:.heavy)
   drawThumbDiagram(scene.diagram)
   if !t.sub.isEmpty {boxText("thumb","サムネイル補足",t.sub,NSRect(x:60,y:24,width:1160,height:72),36,accent,weight:.semibold)}
  case "c":
   let pair=t.contrast ?? []
   size=boxText("thumb","サムネイル見出し",oneLine,NSRect(x:60,y:520,width:1160,height:170),88,.white,weight:.heavy)
   let l=NSRect(x:60,y:110,width:520,height:360),r=NSRect(x:700,y:110,width:520,height:360)
   rect(l,panel,28);rect(r,accent,28)
   boxText("thumb","サムネイル補足",pair.first ?? "",l.insetBy(dx:36,dy:36),64,muted,align:.center,bg:panel,weight:.bold)
   boxText("thumb","サムネイル補足",pair.count>1 ? pair[1] : "",r.insetBy(dx:36,dy:36),72,dark0,align:.center,bg:accent,weight:.heavy)
   arrowLine(NSPoint(x:596,y:290),NSPoint(x:684,y:290))
   if !t.sub.isEmpty {boxText("thumb","サムネイル補足",t.sub,NSRect(x:60,y:24,width:1160,height:70),34,muted)}
  default:
   size=boxText("thumb","サムネイル見出し",t.headline,NSRect(x:60,y:200,width:720,height:420),112,.white,weight:.heavy)
   if !t.sub.isEmpty {boxText("thumb","サムネイル補足",t.sub,NSRect(x:60,y:70,width:720,height:110),40,muted)}
   let c=NSPoint(x:1030,y:380),rad:CGFloat=170
   accent.withAlphaComponent(0.18).setFill();NSBezierPath(ovalIn:NSRect(x:c.x-rad-28,y:c.y-rad-28,width:(rad+28)*2,height:(rad+28)*2)).fill()
   let ring=NSBezierPath(ovalIn:NSRect(x:c.x-rad,y:c.y-rad,width:rad*2,height:rad*2));ring.lineWidth=10;accent.setStroke();ring.stroke()
   boxText("thumb","サムネイル補足",t.keyword ?? "？",NSRect(x:c.x-rad+30,y:c.y-rad+40,width:(rad-30)*2,height:(rad-40)*2),120,accent,align:.center,weight:.heavy)
 }
 let mine=records.filter{$0.file==t.file}
 let fitted=mine.allSatisfy{$0.fitted}
 let rec=ThumbRecord(file:t.file,variant:t.variant,headlineSize:Double(size),fitted:fitted,contrast:mine.map{$0.contrast}.min() ?? 0)
 return (finish(ctx,b),rec)
}

var thumbRecords:[ThumbRecord]=[]
for t in spec.thumbnails ?? [] {
 let (img,rec)=thumbnail(t)
 thumbRecords.append(rec)
 try NSBitmapImageRep(cgImage:img).representation(using:.png,properties:[:])!.write(to:dir.appendingPathComponent(t.file))
}
if !thumbRecords.isEmpty {
 let enc=JSONEncoder();enc.outputFormatting=[.prettyPrinted]
 try enc.encode(thumbRecords).write(to:dir.appendingPathComponent("thumbnails-report.json"))
}

for f in spec.frames {
 currentFile=f.file
 let bitmap=NSBitmapImageRep(cgImage:frame(f))
 try bitmap.representation(using:.png,properties:[:])!.write(to:dir.appendingPathComponent(f.file))
}
let encoder=JSONEncoder();encoder.outputFormatting=[.prettyPrinted]
try encoder.encode(records).write(to:dir.appendingPathComponent("render-report.json"))
let overflow=records.filter{!$0.fitted}
if !overflow.isEmpty {
 var seen=Set<String>()
 let lines=overflow.compactMap{r->String? in let k="\(r.role)|\(r.text)";if seen.contains(k){return nil};seen.insert(k);return "- \(r.role): \(r.text)"}
 fail("文字が枠に収まりません（\(lines.count)件。render-report.json参照）\n"+lines.joined(separator:"\n"))
}
print("Rendered \(spec.frames.count) images")
