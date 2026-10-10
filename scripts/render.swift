// 場面画像の描画（AppKit）。入力は <job-dir>/plan.json（台本v2）と render-spec.json（src/timeline.ts が作る区間仕様）。
// 出力は区間ごとのPNGと render-report.json（文字の大きさ・枠に収まったか）。収まらない文字があれば終了コード1。
import Foundation
import AppKit
import CoreVideo

// 台本形式v2（src/plan.ts）。図解は種別ごとに使う欄が異なるため任意項目にする。
struct Cue: Codable { let text:String; let seconds:Double }
struct Diagram: Codable { let type:String; let items:[String]?; let left:String?; let right:String?; let leftItems:[String]?; let rightItems:[String]?; let value:String?; let label:String?; let note:String?; let question:String?; let yes:String?; let no:String? }
struct Scene: Codable { let title:String; let narration:String; let cues:[Cue]; let diagram:Diagram; let seconds:Int; let chapter:String?; let fictional:Bool?; let sources:[String]; let emphasis:[String]? }
struct Source: Codable { let id:String; let title:String }
struct Plan: Codable { let schema:Int; let id:String; let title:String; let version:Int; let scenes:[Scene]; let sources:[Source] }
struct RenderFrame: Codable { let file:String; let scene:Int; let step:Int; let cue:Int?; let fade:Double?; let highlight:Bool? }
struct ThumbSpec: Codable { let file:String; let variant:String; let headline:String; let sub:String; let scene:Int }
struct ThumbRecord: Codable { let file:String; let variant:String; let headlineSize:Double; let fitted:Bool; let contrast:Double }
struct RenderSpec: Codable { let fps:Int; let subtitles:String; let frames:[RenderFrame]; let thumbnails:[ThumbSpec]?; let scale:Double? }
struct FitRecord: Codable { let file:String; let role:String; let text:String; let size:Double; let maxSize:Double; let fitted:Bool; let pixelSize:Double; let contrast:Double }

func fail(_ message:String)->Never { fputs(message+"\n",stderr);exit(1) }
guard CommandLine.arguments.count==2 else { fail("usage: render <job-dir>") }
let dir=URL(fileURLWithPath:CommandLine.arguments[1])
let plan=try JSONDecoder().decode(Plan.self,from:Data(contentsOf:dir.appendingPathComponent("plan.json")))
let spec=try JSONDecoder().decode(RenderSpec.self,from:Data(contentsOf:dir.appendingPathComponent("render-spec.json")))
// 座標は1280×720の論理座標で書き、scale倍の画素で描く（T091: 1080pはscale=1.5）。
let scale=CGFloat(spec.scale ?? 1)
let w=Int(1280*scale),h=Int(720*scale)
let dark0=NSColor(srgbRed:12/255,green:22/255,blue:38/255,alpha:1)
let accent=color(81,212,184),muted=color(160,177,197),panel=color(27,46,67)
var records:[FitRecord]=[]
// 最新の段の描画状態（T079）。frame()の中で設定する。
var curFade:CGFloat=1, curHighlight=false
var currentFile=""

func color(_ r:CGFloat,_ g:CGFloat,_ b:CGFloat)->NSColor {NSColor(srgbRed:r/255,green:g/255,blue:b/255,alpha:1)}
func rect(_ x:CGFloat,_ y:CGFloat,_ width:CGFloat,_ height:CGFloat,_ c:NSColor){c.setFill();NSBezierPath(roundedRect:NSRect(x:x,y:y,width:width,height:height),xRadius:18,yRadius:18).fill()}
func attributes(_ size:CGFloat,_ c:NSColor)->[NSAttributedString.Key:Any] {
 let p=NSMutableParagraphStyle();p.lineBreakMode = .byWordWrapping
 return [.font:NSFont.systemFont(ofSize:size,weight:.medium),.foregroundColor:c,.paragraphStyle:p]
}
// 固定サイズの文字（ラベル類）。描画枠はM1と同じく高さ100。
func text(_ value:String,_ x:CGFloat,_ y:CGFloat,_ size:CGFloat,_ c:NSColor,_ width:CGFloat=1160,_ height:CGFloat=100){
 (value as NSString).draw(in:NSRect(x:x,y:y,width:width,height:height),withAttributes:attributes(size,c))
}
// 枠に収まるよう文字を計測して縮小する（T043）。maxHeightを超えるならminSizeまで1ptずつ下げ、それでも超えれば不合格として記録。
@discardableResult
func fitText(_ role:String,_ value:String,_ x:CGFloat,_ y:CGFloat,_ maxSize:CGFloat,_ c:NSColor,_ width:CGFloat,_ maxHeight:CGFloat,_ boxHeight:CGFloat=100,bg:NSColor=dark0)->CGFloat{
 let minSize=(maxSize*0.6).rounded()
 var size=maxSize
 func height(_ s:CGFloat)->CGFloat {(value as NSString).boundingRect(with:NSSize(width:width,height:10000),options:[.usesLineFragmentOrigin],attributes:attributes(s,c)).height}
 while size>minSize && height(size)>maxHeight { size-=1 }
 let fitted=height(size)<=maxHeight
 records.append(FitRecord(file:currentFile,role:role,text:value,size:Double(size),maxSize:Double(maxSize),fitted:fitted,pixelSize:Double(size*scale),contrast:contrast(c,bg)))
 text(value,x,y,size,c,width,boxHeight)
 return size
}
func arrow(_ x:CGFloat,_ y:CGFloat){text("→",x,y,27,accent,40)}
// 最新の段をフェードで描き、強調中なら縁取りする（T079）。
func newest(_ isNewest:Bool,_ box:NSRect,_ draw:()->Void){
 guard isNewest, let cg=NSGraphicsContext.current?.cgContext else { draw(); return }
 cg.saveGState();cg.setAlpha(curFade);draw();cg.restoreGState()
 if curHighlight && box != .zero {accent.setStroke();let p=NSBezierPath(roundedRect:box.insetBy(dx:-4,dy:-4),xRadius:20,yRadius:20);p.lineWidth=3;p.stroke()}
}
func fits(_ value:String,_ size:CGFloat,_ width:CGFloat,_ maxHeight:CGFloat)->Bool {
 (value as NSString).boundingRect(with:NSSize(width:width,height:10000),options:[.usesLineFragmentOrigin],attributes:attributes(size,.white)).height<=maxHeight
}
// 出典番号: 場面での初出順、続いて未参照の出典（src/channel.ts sourcesText と同じ規則）。
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

// 図解。stepまでの要素だけを描く（段階表示）。座標はAppKitの左下原点。
func drawFlow(_ items:[String],_ step:Int){
 let n=CGFloat(items.count),gap:CGFloat=40,bw=(1160-gap*(n-1))/n
 for (i,label) in items.enumerated() where i<step {
  let x=60+CGFloat(i)*(bw+gap)
  newest(i==step-1,NSRect(x:x,y:290,width:bw,height:125)){
   rect(x,290,bw,125,panel);text(String(format:"%02d",i+1),x+22,325,21,accent)
   fitText("図解",label,x+22,267,25,.white,bw-35,62,bg:panel)
  }
  if i<items.count-1 && i+1<step {newest(i+1==step-1,NSRect.zero){arrow(x+bw+5,292)}}
 }
}
func drawCompare(_ d:Diagram,_ step:Int){
 let cols:[(String,[String])]=[(d.left ?? "",d.leftItems ?? []),(d.right ?? "",d.rightItems ?? [])]
 for (i,col) in cols.enumerated() where i<step {
  let x=60+CGFloat(i)*600
  newest(i==step-1,NSRect(x:x,y:225,width:560,height:200)){
   rect(x,225,560,200,panel)
   fitText("図解見出し",col.0,x+24,322,27,accent,510,36,bg:panel)
   for (k,item) in col.1.enumerated(){fitText("図解",item,x+24,280-CGFloat(k)*44,24,.white,510,32,bg:panel)}
  }
 }
 if step>=2 {newest(step==2,NSRect.zero){text("⇔",622,232,30,accent,40)}}
}
func drawNumber(_ d:Diagram){
 newest(true,NSRect(x:60,y:225,width:1160,height:200)){
  rect(60,225,1160,200,panel)
  fitText("数値",d.value ?? "",100,262,72,accent,360,90,bg:panel)
  fitText("図解見出し",d.label ?? "",480,312,32,.white,700,44,bg:panel)
  if let note=d.note {fitText("図解",note,480,262,24,muted,700,34,bg:panel)}
 }
}
func drawBranch(_ d:Diagram,_ step:Int){
 newest(step==1,NSRect(x:60,y:350,width:1160,height:75)){
  rect(60,350,1160,75,panel)
  fitText("図解見出し",d.question ?? "",90,315,30,.white,1100,40,bg:panel)
 }
 if step>=2 {
  newest(true,NSRect(x:60,y:225,width:1160,height:100)){
   rect(60,225,560,100,panel);rect(660,225,560,100,panel)
   text("はい",84,222,21,accent,100);fitText("図解",d.yes ?? "",84,192,25,.white,510,34,bg:panel)
   text("いいえ",684,222,21,accent,100);fitText("図解",d.no ?? "",684,192,25,.white,510,34,bg:panel)
  }
 }
}

func frame(_ f:RenderFrame)->CGImage {
 let scene=plan.scenes[f.scene]
 curFade=CGFloat(f.fade ?? 1);curHighlight=f.highlight ?? false
 var buffer:CVPixelBuffer?;let status=CVPixelBufferCreate(kCFAllocatorDefault,w,h,kCVPixelFormatType_32ARGB,[kCVPixelBufferCGImageCompatibilityKey:true,kCVPixelBufferCGBitmapContextCompatibilityKey:true] as CFDictionary,&buffer)
 guard status==kCVReturnSuccess,let b=buffer else { fail("CVPixelBufferCreate failed: \(status)") };CVPixelBufferLockBaseAddress(b,[])
 let ctx=CGContext(data:CVPixelBufferGetBaseAddress(b),width:w,height:h,bitsPerComponent:8,bytesPerRow:CVPixelBufferGetBytesPerRow(b),space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.noneSkipFirst.rawValue)!
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:ctx,flipped:false);ctx.scaleBy(x:scale,y:scale)
 color(12,22,38).setFill();NSRect(x:0,y:0,width:1280,height:720).fill()
 // 章があれば見出しの上に「第N章」を表示する（T080）。章がない台本はM1と同じ表記。
 if let ch=scene.chapter {fitText("章",chapterLabel(f.scene,ch),60,590,21,accent,1160,30)} else {text("INVESTMENT × PSYCHOLOGY   /   LOCAL DEMO",60,590,21,accent)}
 fitText("見出し",scene.title,60,475,44,.white,1160,58)
 // 架空の例であることを明示する札（T081）。
 if scene.fictional == true {rect(1060,592,160,34,panel);text("架空の例",1078,525,20,accent,140)}
 switch scene.diagram.type {
  case "flow": drawFlow(scene.diagram.items ?? [],f.step)
  case "compare": drawCompare(scene.diagram,f.step)
  case "number": drawNumber(scene.diagram)
  case "branch": drawBranch(scene.diagram,f.step)
  default: fail("未対応の図解: \(scene.diagram.type)")
 }
 if let cue=f.cue {rect(45,80,1190,115,color(20,34,52));fitText("字幕",scene.cues[cue].text,70,92,29,.white,1140,76,bg:color(20,34,52))}
 // キーワード強調（T078）。焼き込み字幕があれば字幕枠の上に小さく、なければ字幕枠の位置に大きく出す。
 if let words=scene.emphasis, !words.isEmpty {
  let burned=f.cue != nil
  let size:CGFloat = burned ? 18 : 28, chipH:CGFloat = burned ? 26 : 50, y:CGFloat = burned ? 198 : 110
  var x:CGFloat=60
  for word in words {
   let wdt=(word as NSString).size(withAttributes:attributes(size,.white)).width+(burned ? 24 : 40)
   rect(x,y,wdt,chipH,panel)
   accent.setStroke();let border=NSBezierPath(roundedRect:NSRect(x:x+1,y:y+1,width:wdt-2,height:chipH-2),xRadius:17,yRadius:17);border.lineWidth=2;border.stroke()
   fitText("強調",word,x+(burned ? 12 : 20),y+chipH-100-(burned ? 4 : 9),size,accent,wdt,chipH,bg:panel)
   x+=wdt+16
  }
 }
 text("音声：自作の確認音 / ナレーション未接続",60,0,17,muted)
 // 場面の出典（T072）。出典のある場面だけ、フッター中央に表示する。
 // 題名が収まらなければ、概要欄の出典番号（src/channel.tsのsourcesTextと同じ順）で示す。
 if !scene.sources.isEmpty {
  let titles=scene.sources.compactMap{id in plan.sources.first{$0.id==id}?.title}
  let full="出典: "+titles.joined(separator:" / ")
  let short="出典: 概要欄 "+scene.sources.map{"[\(sourceNumber($0))]"}.joined()
  fitText("出典",fits(full,17,620,24) ? full : short,470,0,17,muted,620,24)
 }
 text("\(f.scene+1) / \(plan.scenes.count)",1115,0,20,muted,130)
 rect(60,65,1160,4,accent) // 装飾線（旧progressは常に1で全幅だった）
 let result=ctx.makeImage()!;NSGraphicsContext.restoreGraphicsState();CVPixelBufferUnlockBaseAddress(b,[]);return result
}

// WCAGの相対輝度とコントラスト比（T073、T091）。
func luminance(_ c:NSColor)->Double {
 let s=c.usingColorSpace(.sRGB)!
 func ch(_ v:CGFloat)->Double {let x=Double(v);return x<=0.03928 ? x/12.92 : pow((x+0.055)/1.055,2.4)}
 return 0.2126*ch(s.redComponent)+0.7152*ch(s.greenComponent)+0.0722*ch(s.blueComponent)
}
func contrast(_ a:NSColor,_ b:NSColor)->Double {let (l1,l2)=(luminance(a),luminance(b));return (max(l1,l2)+0.05)/(min(l1,l2)+0.05)}

// サムネイル（T073）。a=見出し中心、b=図解つき、c=反転配色。1280×720（公式の最小幅640px・16:9を満たす）。
func thumbnail(_ t:ThumbSpec)->(CGImage,ThumbRecord) {
 var buffer:CVPixelBuffer?;let status=CVPixelBufferCreate(kCFAllocatorDefault,w,h,kCVPixelFormatType_32ARGB,[kCVPixelBufferCGImageCompatibilityKey:true,kCVPixelBufferCGBitmapContextCompatibilityKey:true] as CFDictionary,&buffer)
 guard status==kCVReturnSuccess,let b=buffer else { fail("CVPixelBufferCreate failed: \(status)") };CVPixelBufferLockBaseAddress(b,[])
 let ctx=CGContext(data:CVPixelBufferGetBaseAddress(b),width:w,height:h,bitsPerComponent:8,bytesPerRow:CVPixelBufferGetBytesPerRow(b),space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.noneSkipFirst.rawValue)!
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:ctx,flipped:false);ctx.scaleBy(x:scale,y:scale)
 let dark=color(12,22,38)
 let bg = t.variant=="c" ? accent : dark
 let fg = t.variant=="c" ? dark : NSColor.white
 bg.setFill();NSRect(x:0,y:0,width:1280,height:720).fill()
 currentFile=t.file
 curFade=1;curHighlight=false
 var size:CGFloat=0
 switch t.variant {
  case "b":
   let scene=plan.scenes[t.scene]
   switch scene.diagram.type {
    case "flow": drawFlow(scene.diagram.items ?? [],99)
    case "compare": drawCompare(scene.diagram,99)
    case "number": drawNumber(scene.diagram)
    default: drawBranch(scene.diagram,99)
   }
   size=fitText("サムネイル見出し",t.headline,60,450,80,fg,1160,200,240,bg:bg)
   if !t.sub.isEmpty {fitText("サムネイル補足",t.sub,60,90,36,accent,1160,90,100,bg:bg)}
  default:
   rect(60,560,120,10,t.variant=="c" ? dark : accent)
   size=fitText("サムネイル見出し",t.headline,60,200,110,fg,1160,330,340,bg:bg)
   if !t.sub.isEmpty {fitText("サムネイル補足",t.sub,60,60,40,t.variant=="c" ? dark : muted,1160,100,100,bg:bg)}
 }
 let fitted=records.last{ $0.file==t.file && $0.role=="サムネイル見出し" }?.fitted ?? false
 let rec=ThumbRecord(file:t.file,variant:t.variant,headlineSize:Double(size),fitted:fitted,contrast:contrast(fg,bg))
 let result=ctx.makeImage()!;NSGraphicsContext.restoreGraphicsState();CVPixelBufferUnlockBaseAddress(b,[]);return (result,rec)
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
