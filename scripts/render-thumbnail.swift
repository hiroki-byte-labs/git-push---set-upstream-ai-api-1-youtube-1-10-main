// サムネイル専用PNG描画エンジン（T163）
// 動画を生成せず、briefと自作素材から直接1280x720 PNGを描画し、文字寸法・コントラスト・実測値を報告する。
import AppKit
import Foundation
import CryptoKit

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
    let isLight = (c.composition == "scene" && c.headline.contains("差別")) // 明色例
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

    var fitted = false
    var finalFontSize = maxFontSize
    var drawnRect = DrawnRect(x: 0, y: 0, width: 0, height: 0)

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
        let attrStr = NSAttributedString(string: c.headline, attributes: attrs)
        let rect = attrStr.boundingRect(with: headlineBox.size, options: [.usesLineFragmentOrigin])

        if rect.width <= headlineBox.width && rect.height <= headlineBox.height {
            fitted = true
            finalFontSize = fs
            let drawX = (align == .center) ? headlineBox.origin.x + (headlineBox.width - rect.width) / 2 : headlineBox.origin.x
            let drawY = headlineBox.origin.y + (headlineBox.height - rect.height) / 2
            attrStr.draw(in: NSRect(x: drawX, y: drawY, width: rect.width, height: rect.height))
            drawnRect = DrawnRect(x: Double(drawX), y: Double(drawY), width: Double(rect.width), height: Double(rect.height))
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
            subAttrStr.draw(in: NSRect(x: sx, y: sy, width: subRect.width, height: subRect.height))
        } else {
            issues.append("補足見出しが枠内に収まりません")
        }
    }

    // コントラスト比計算
    let cr = contrastRatio(bgColor, textColor)
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
