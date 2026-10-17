// サムネイル専用PNG描画エンジン（T163）
// 動画を生成せず、briefと自作素材から直接1280x720 PNGを描画し、文字寸法・コントラスト・実測値を報告する。
import AppKit
import Foundation
import CryptoKit
import CoreText

// ----------------------------------------------------
// 型定義
// ----------------------------------------------------
struct AssetRef: Codable {
    let assetId: String
    let rightsBasis: String
    let license: String?
    let sourceReference: String?
}

struct Grounding: Codable {
    let sceneIndex: Int?
    let sceneTitle: String?
    let sourceIds: [String]?
}

struct Candidate: Codable {
    let typography: Typography?
    let id: String
    let headline: String
    let sub: String?
    let composition: String
    let motifs: [String]
    let grounding: Grounding?
    let assets: [AssetRef]
    let reason: String
    let unknowns: [String]?
    let status: String?
    let tone: String?
}

struct Typography: Codable {
    let family: String
    let weight: Int
    let emphasis: [String]?
    let outline: Bool?
    let glow: Bool?
    let gradient: Bool?
}
struct TypographyReport: Codable {
    let family: String
    let fontName: String
    let weight: Int
    let outline: Bool
    let glow: Bool
    let gradient: Bool
}

struct ThumbnailBrief: Codable {
    let schema: String
    let planId: String
    let inputHash: String
    let candidates: [Candidate]
    let overallStatus: String
    let unknowns: [String]?
}

struct DrawnRect: Codable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct ThumbReportItem: Codable {
    let typography: TypographyReport?
    let file: String
    let variant: String
    let headline: String
    let headlineSize: Double
    let fitted: Bool
    let contrast: Double
    let bytes: Int
    let assetHashes: [String: String]
    let drawnBox: DrawnRect
    let ok: Bool
    let issues: [String]
}

var fontDescriptors: [String: CTFontDescriptor] = [:]
var fontCache: [String: NSFont] = [:]
func typographyFont(_ style: Typography, _ size: CGFloat) -> NSFont {
    let key = "\(style.family)-\(style.weight)-\(size)"
    if let cached = fontCache[key] { return cached }
    let directory = style.family == "mincho" ? "noto-serif-jp" : "noto-sans-jp"
    let filename = style.family == "mincho" ? "NotoSerifJP.ttf" : "NotoSansJP.ttf"
    let url = URL(fileURLWithPath: "assets/fonts/\(directory)/\(filename)")
    if fontDescriptors[style.family] == nil {
        var error: Unmanaged<CFError>?
        // Process scope only: no installation into the user's font collection.
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error)
        guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor], let descriptor = descriptors.first else {
            fail("同梱フォントを読み込めません")
        }
        fontDescriptors[style.family] = descriptor
    }
    let descriptor = fontDescriptors[style.family]!
    let variation = [NSNumber(value: 0x77676874): NSNumber(value: style.weight)]
    let varied = CTFontDescriptorCreateCopyWithAttributes(descriptor, [kCTFontVariationAttribute: variation] as CFDictionary)
    let font = CTFontCreateWithFontDescriptor(varied, size, nil)
    fontCache[key] = font as NSFont
    return font as NSFont
}

func headlineString(_ text: String, _ style: Typography, _ size: CGFloat, _ color: NSColor, _ para: NSParagraphStyle) -> NSMutableAttributedString {
    let font = typographyFont(style, size)
    let string = NSMutableAttributedString(string: text, attributes: [.font: font, .foregroundColor: color, .paragraphStyle: para])
    let nsText = text as NSString
    var location = 0
    for char in text {
        let s = String(char), length = (s as NSString).length
        var factor: CGFloat = 1
        if s.range(of: "[一-龯]", options: .regularExpression) != nil { factor = 1.10 }
        if s.range(of: "[ぁ-ゖ、。？！?!]", options: .regularExpression) != nil { factor = 0.78 }
        string.addAttribute(.font, value: typographyFont(style, size * factor), range: NSRange(location: location, length: length))
        location += length
    }
    for word in style.emphasis ?? [] {
        var search = NSRange(location: 0, length: nsText.length)
        while search.length > 0 {
            let range = nsText.range(of: word, options: [], range: search)
            if range.location == NSNotFound { break }
            string.addAttribute(.font, value: typographyFont(style, size * 1.22), range: range)
            search = NSRange(location: NSMaxRange(range), length: nsText.length - NSMaxRange(range))
        }
    }
    return string
}

// ----------------------------------------------------
// ユーティリティ
// ----------------------------------------------------
func fail(_ msg: String) -> Never {
    fputs("ERROR: " + msg + "\n", stderr)
    exit(1)
}

func srgbColor(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1.0) -> NSColor {
    return NSColor(srgbRed: r / 255.0, green: g / 255.0, blue: b / 255.0, alpha: a)
}

// WCAG 2.x 相対輝度とコントラスト比
func relativeLuminance(_ c: NSColor) -> CGFloat {
    let rgb = c.usingColorSpace(.sRGB) ?? c
    func f(_ v: CGFloat) -> CGFloat {
        return v <= 0.03928 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * f(rgb.redComponent) + 0.7152 * f(rgb.greenComponent) + 0.0722 * f(rgb.blueComponent)
}

func contrastRatio(_ c1: NSColor, _ c2: NSColor) -> CGFloat {
    let l1 = relativeLuminance(c1)
    let l2 = relativeLuminance(c2)
    let lighter = max(l1, l2)
    let darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)
}

// SHA-256
func fileSha256(_ url: URL) -> String? {
    guard let data = try? Data(contentsOf: url) else { return nil }
    let digest = SHA256.hash(data: data)
    return digest.map { String(format: "%02x", $0) }.joined()
}

// ----------------------------------------------------
// 引数チェック
// ----------------------------------------------------
guard CommandLine.arguments.count >= 4 else {
    fail("Usage: render-thumbnail <brief.json> <assets-dir> <output-dir>")
}

let briefUrl = URL(fileURLWithPath: CommandLine.arguments[1])
let assetsDir = URL(fileURLWithPath: CommandLine.arguments[2])
let outDir = URL(fileURLWithPath: CommandLine.arguments[3])

guard let briefData = try? Data(contentsOf: briefUrl),
      let brief = try? JSONDecoder().decode(ThumbnailBrief.self, from: briefData) else {
    fail("brief.json の読み込みまたはデコードに失敗しました: \(briefUrl.path)")
}

try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true, attributes: nil)

var reportItems: [ThumbReportItem] = []

// 1280x720 固定寸法
let width = 1280
let height = 720

// 各候補を描画
for c in brief.candidates {
    var issues: [String] = []
    let fileName = "thumbnail-\(c.id).png"
    let fileUrl = outDir.appendingPathComponent(fileName)

    // カラーパレット決定（構図・明暗）
    // 背景の明暗はbriefの明示指定だけで決める（見出しの語句から推測しない。T163追加修正）
    let isLight = c.tone == "light"
    let bgColor = isLight ? srgbColor(245, 243, 236) : srgbColor(14, 20, 30) // #0e141e
    let textColor = isLight ? srgbColor(26, 31, 44) : srgbColor(255, 255, 255)
    let subTextColor = isLight ? srgbColor(74, 85, 104) : srgbColor(160, 178, 200)
    let accentColor = isLight ? srgbColor(197, 48, 48) : srgbColor(224, 90, 71) // #e05a47

    // CGContext作成
    let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    guard let ctx = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        fail("CGContextの生成に失敗しました")
    }

    let nsCtx = NSGraphicsContext(cgContext: ctx, flipped: false)
    NSGraphicsContext.current = nsCtx

    // 背景塗り
    bgColor.setFill()
    NSRect(x: 0, y: 0, width: width, height: height).fill()

    // 素材ハッシュ収集
    var assetHashes: [String: String] = [:]
    for a in c.assets {
        // 例: assetId = "asset:person-solo" -> "assets/thumbnail-originals/person-solo.svg"
        let baseName = a.assetId.replacingOccurrences(of: "asset:", with: "").replacingOccurrences(of: "builtin:motif-", with: "")
        let svgName = baseName + ".svg"
        let assetPath = assetsDir.appendingPathComponent(svgName)
        if FileManager.default.fileExists(atPath: assetPath.path) {
            if let h = fileSha256(assetPath) {
                assetHashes[a.assetId] = h
            }
        }
    }

    // 構図ごとの装飾・図形描画
    switch c.composition {
    case "contrast":
        // 左右対比: 左右のカードとVS記号
        let leftCard = NSRect(x: 80, y: 80, width: 500, height: 420)
        let rightCard = NSRect(x: 700, y: 80, width: 500, height: 420)
        srgbColor(22, 32, 48).setFill()
        NSBezierPath(roundedRect: leftCard, xRadius: 20, yRadius: 20).fill()
        srgbColor(26, 38, 58).setFill()
        NSBezierPath(roundedRect: rightCard, xRadius: 20, yRadius: 20).fill()

        // VS記号
        let vsFont = NSFont.systemFont(ofSize: 44, weight: .heavy)
        let vsAttrs: [NSAttributedString.Key: Any] = [
            .font: vsFont,
            .foregroundColor: srgbColor(100, 120, 150)
        ]
        let vsStr = NSAttributedString(string: "VS", attributes: vsAttrs)
        vsStr.draw(at: NSPoint(x: 615, y: 260))

    case "symbol":
        // 象徴型: 右側に輝く円環・アクセントオーラ
        let center = NSPoint(x: 950, y: 360)
        let radius: CGFloat = 220
        accentColor.withAlphaComponent(0.12).setFill()
        NSBezierPath(ovalIn: NSRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)).fill()
        let ring = NSBezierPath(ovalIn: NSRect(x: center.x - radius + 30, y: center.y - radius + 30, width: (radius - 30) * 2, height: (radius - 30) * 2))
        ring.lineWidth = 8
        accentColor.withAlphaComponent(0.6).setStroke()
        ring.stroke()

    case "relationship", "scene":
        // 関係・因果・情景型: 下部に流れるグリッドと因果矢印
        let path = NSBezierPath()
        path.move(to: NSPoint(x: 80, y: 240))
        path.curve(to: NSPoint(x: 1200, y: 240), controlPoint1: NSPoint(x: 400, y: 280), controlPoint2: NSPoint(x: 800, y: 200))
        path.lineWidth = 6
        accentColor.withAlphaComponent(0.5).setStroke()
        path.stroke()

    default:
        break
    }

    // ----------------------------------------------------
    // 主見出しの計測と描画
    // ----------------------------------------------------
    var headlineBox = NSRect(x: 80, y: 440, width: 1120, height: 220)
    var maxFontSize: CGFloat = 78
    var minFontSize: CGFloat = 48
    var align: NSTextAlignment = .left

    if c.composition == "contrast" {
        headlineBox = NSRect(x: 80, y: 530, width: 1120, height: 140)
        maxFontSize = 72
        minFontSize = 46
        align = .center
    } else if c.composition == "symbol" {
        headlineBox = NSRect(x: 80, y: 260, width: 680, height: 360)
        maxFontSize = 84
        minFontSize = 52
        align = .left
    }
    if c.typography != nil && c.composition != "symbol" && c.composition != "contrast" {
        headlineBox = NSRect(x: 80, y: 500, width: 1120, height: 170)
    }

    var fitted = false
    var finalFontSize = maxFontSize
    var drawnRect = DrawnRect(x: 0, y: 0, width: 0, height: 0)
    var typographyReport: TypographyReport? = nil
    let contentBox = c.typography == nil ? headlineBox : headlineBox.insetBy(dx: 10, dy: 10)

    for fs in stride(from: maxFontSize, through: minFontSize, by: -2) {
        let para = NSMutableParagraphStyle()
        para.lineBreakMode = .byWordWrapping
        para.alignment = align
        // ヒラギノ明朝 / システム明朝系
        let font = NSFont(name: "Hiragino Mincho ProN W6", size: fs) ?? NSFont.systemFont(ofSize: fs, weight: .bold)
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: textColor,
            .paragraphStyle: para
        ]
        let attrStr: NSAttributedString = c.typography.map { headlineString(c.headline, $0, fs, textColor, para) } ?? NSAttributedString(string: c.headline, attributes: attrs)
        let rect = attrStr.boundingRect(with: contentBox.size, options: [.usesLineFragmentOrigin, .usesFontLeading])
        // Variable CJK fonts need trailing line descent space when mixed-size
        // runs wrap; reserve it before fitting rather than clipping the glyphs.
        let descentSpace: CGFloat = c.typography != nil && rect.height > fs * 2 ? fs * 0.6 : 0
        let layoutHeight = rect.height + descentSpace

        if rect.width <= contentBox.width && layoutHeight <= contentBox.height {
            fitted = true
            finalFontSize = fs
            let drawX = (align == .center) ? contentBox.origin.x + (contentBox.width - rect.width) / 2 : contentBox.origin.x
            let drawY = contentBox.origin.y + (contentBox.height - layoutHeight) / 2
            // Keep the exact layout width used for measurement. Shrinking to
            // usedRect.width causes another wrap and clips multiline glyphs.
            let drawBox = c.typography == nil
                ? NSRect(x: drawX, y: drawY, width: ceil(rect.width) + 1, height: ceil(rect.height) + 1)
                : NSRect(x: contentBox.origin.x, y: drawY, width: contentBox.width, height: ceil(layoutHeight) + 4)
            if let style = c.typography {
                let range = NSRange(location: 0, length: attrStr.length)
                let outer = NSMutableAttributedString(attributedString: attrStr)
                if style.outline == true { outer.addAttributes([.strokeWidth: 7, .strokeColor: srgbColor(4, 8, 15)], range: range) }
                if style.glow == true {
                    let shadow = NSShadow(); shadow.shadowColor = accentColor.withAlphaComponent(0.55)
                    shadow.shadowBlurRadius = 5; shadow.shadowOffset = NSSize(width: 0, height: -1)
                    outer.addAttribute(.shadow, value: shadow, range: range)
                }
                outer.draw(in: drawBox)
                let fill = NSMutableAttributedString(attributedString: attrStr)
                if style.outline == true { fill.addAttributes([.strokeWidth: -1.5, .strokeColor: srgbColor(245, 230, 196)], range: range) }
                fill.draw(in: drawBox)
                if style.gradient == true {
                    ctx.saveGState(); ctx.beginTransparencyLayer(auxiliaryInfo: nil)
                    attrStr.draw(in: drawBox)
                    ctx.setBlendMode(.sourceIn)
                    NSGradient(starting: textColor, ending: isLight ? textColor : srgbColor(242, 217, 163))!.draw(in: drawBox, angle: 90)
                    ctx.endTransparencyLayer(); ctx.restoreGState()
                }
                let selected = typographyFont(style, fs)
                let variation = CTFontCopyVariation(selected as CTFont) as? [NSNumber: NSNumber]
                let actualWeight = variation?[NSNumber(value: 0x77676874)]?.intValue ?? 0
                if actualWeight != style.weight { issues.append("要求したfont weightと実フォントが不一致") }
                typographyReport = TypographyReport(family: style.family, fontName: selected.fontName, weight: actualWeight,
                    outline: style.outline == true, glow: style.glow == true, gradient: style.gradient == true)
                let familyDir = style.family == "mincho" ? "noto-serif-jp/NotoSerifJP.ttf" : "noto-sans-jp/NotoSansJP.ttf"
                if let hash = fileSha256(URL(fileURLWithPath: "assets/fonts/" + familyDir)) { assetHashes["font:" + style.family] = hash }
            } else { attrStr.draw(in: drawBox) }
            drawnRect = DrawnRect(x: Double(drawX), y: Double(drawY), width: Double(rect.width), height: Double(layoutHeight))
            break
        }
    }

    if !fitted {
        issues.append("主見出しが枠内(\(headlineBox.width)x\(headlineBox.height))に収まりません")
    }

    // ----------------------------------------------------
    // 補足見出しの描画
    // ----------------------------------------------------
    if let subText = c.sub, !subText.isEmpty {
        var subBox = NSRect(x: 80, y: 480, width: 1120, height: 50)
        if c.composition == "symbol" {
            subBox = NSRect(x: 80, y: 180, width: 680, height: 60)
        } else if c.composition == "contrast" {
            subBox = NSRect(x: 80, y: 470, width: 1120, height: 50)
        } else if c.typography != nil {
            subBox = NSRect(x: 80, y: 430, width: 1120, height: 50)
        }

        let subPara = NSMutableParagraphStyle()
        subPara.lineBreakMode = .byWordWrapping
        subPara.alignment = align
        let subFont = NSFont.systemFont(ofSize: 30, weight: .medium)
        let subAttrs: [NSAttributedString.Key: Any] = [
            .font: subFont,
            .foregroundColor: subTextColor,
            .paragraphStyle: subPara
        ]
        let subAttrStr = NSAttributedString(string: subText, attributes: subAttrs)
        let subRect = subAttrStr.boundingRect(with: subBox.size, options: [.usesLineFragmentOrigin])
        if subRect.height <= subBox.height {
            let sx = (align == .center) ? subBox.origin.x + (subBox.width - subRect.width) / 2 : subBox.origin.x
            let sy = subBox.origin.y + (subBox.height - subRect.height) / 2
            let subDrawBox = NSRect(x: sx, y: sy, width: subRect.width, height: subRect.height)
            subAttrStr.draw(in: subDrawBox)
            if c.typography != nil && subDrawBox.intersects(NSRect(x: drawnRect.x, y: drawnRect.y, width: drawnRect.width, height: drawnRect.height).insetBy(dx: -6, dy: -6)) {
                issues.append("主見出しと補足見出しの描画領域が衝突")
            }
        } else {
            issues.append("補足見出しが枠内に収まりません")
        }
    }

    // コントラスト比計算
    let cr = c.typography?.gradient == true && !isLight
        ? min(contrastRatio(bgColor, textColor), contrastRatio(bgColor, srgbColor(242, 217, 163)))
        : contrastRatio(bgColor, textColor)
    if cr < 4.5 {
        issues.append("コントラスト比(\(String(format: "%.2f", cr)))が4.5未満です")
    }

    // 画像書き出し
    guard let cgImage = ctx.makeImage() else {
        fail("CGImageの生成に失敗しました")
    }
    let bitmap = NSBitmapImageRep(cgImage: cgImage)
    guard let pngData = bitmap.representation(using: .png, properties: [:]) else {
        fail("PNGデータのエンコードに失敗しました")
    }

    try? pngData.write(to: fileUrl)
    let bytes = pngData.count
    if bytes > 2 * 1024 * 1024 {
        issues.append("ファイル容量(\(bytes)バイト)が2MiBを超過しています")
    }

    // 縮小画像の生成 (sips利用: 320x180, 160x90)
    let small320 = outDir.appendingPathComponent("thumbnail-\(c.id)-320.png")
    let small160 = outDir.appendingPathComponent("thumbnail-\(c.id)-160.png")

    let p1 = Process()
    p1.executableURL = URL(fileURLWithPath: "/usr/bin/sips")
    p1.arguments = ["-z", "180", "320", fileUrl.path, "--out", small320.path]
    try? p1.run()
    p1.waitUntilExit()

    let p2 = Process()
    p2.executableURL = URL(fileURLWithPath: "/usr/bin/sips")
    p2.arguments = ["-z", "90", "160", fileUrl.path, "--out", small160.path]
    try? p2.run()
    p2.waitUntilExit()

    let ok = issues.isEmpty && fitted
    let item = ThumbReportItem(
        typography: typographyReport,
        file: fileName,
        variant: c.id,
        headline: c.headline,
        headlineSize: Double(finalFontSize),
        fitted: fitted,
        contrast: Double(round(cr * 100) / 100),
        bytes: bytes,
        assetHashes: assetHashes,
        drawnBox: drawnRect,
        ok: ok,
        issues: issues
    )
    reportItems.append(item)
}

// レポートJSONの保存
let reportUrl = outDir.appendingPathComponent("thumbnails-report.json")
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted]
if let data = try? encoder.encode(reportItems) {
    try? data.write(to: reportUrl)
}

print("OK: \(reportItems.count) thumbnails rendered successfully")
