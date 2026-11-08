// Draws the Marea icon in the panel's own language: a flat black screen, the slot knob
// (thin ring, amber value arc, pink cap, white slot) and a tide drawn in dot matrix underneath.
// Usage: swift make_icon.swift out.png [full]   ("full" = edge to edge for iOS, else a macOS rounded tile)
import AppKit
let S: CGFloat = 1024
let img = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: img)
let c = NSGraphicsContext.current!.cgContext
func rgb(_ h: Int) -> CGColor { CGColor(red: CGFloat((h >> 16) & 255) / 255, green: CGFloat((h >> 8) & 255) / 255, blue: CGFloat(h & 255) / 255, alpha: 1) }
let full = CommandLine.arguments.count > 2
let inset: CGFloat = full ? 0 : 100
let tile = CGRect(x: inset, y: inset, width: S - 2 * inset, height: S - 2 * inset)
let k = tile.width / S                       // everything scales with the tile
let path = CGPath(roundedRect: tile, cornerWidth: full ? 0 : 185, cornerHeight: full ? 0 : 185, transform: nil)
c.addPath(path); c.setFillColor(rgb(0x0b0c10)); c.fillPath()
c.addPath(path); c.clip()
let cx = S / 2, cy = tile.minY + tile.height * 0.62   // y grows upward in this context
let R = 240 * k
// value ring: grey track, amber value, from lower left round to the right
func arc(_ a0: CGFloat, _ a1: CGFloat, _ col: CGColor, _ w: CGFloat) {
  c.setStrokeColor(col); c.setLineWidth(w); c.setLineCap(.round)
  c.addArc(center: CGPoint(x: cx, y: cy), radius: R, startAngle: a0 * .pi / 180, endAngle: a1 * .pi / 180, clockwise: true); c.strokePath()
}
arc(225, -45, rgb(0x3a3c48), 26 * k)
arc(225, 20, rgb(0xffb000), 26 * k)
// pink cap and white slot, turned to where the value ends
let cap = R * 0.70
c.setFillColor(rgb(0xd4589c)); c.fillEllipse(in: CGRect(x: cx - cap, y: cy - cap, width: 2 * cap, height: 2 * cap))
let ang: CGFloat = 20 * .pi / 180, sl = cap * 0.72, sw = cap * 0.24
c.saveGState(); c.translateBy(x: cx, y: cy); c.rotate(by: ang - .pi / 2)
c.addPath(CGPath(roundedRect: CGRect(x: -sw / 2, y: -sl, width: sw, height: 2 * sl), cornerWidth: sw / 2, cornerHeight: sw / 2, transform: nil))
c.setFillColor(rgb(0xf4f4f2)); c.fillPath(); c.restoreGState()
// the tide: a sine wave of square dots, fading from blue to amber
let cols = 15, rows = 5, d = tile.width * 0.68 / CGFloat(cols), x0 = cx - d * CGFloat(cols) / 2, y0 = tile.minY + tile.height * 0.09
for i in 0..<cols {
  let t = CGFloat(i) / CGFloat(cols - 1)
  let h = Int(round((sin(t * .pi * 2 + 0.6) * 0.5 + 0.5) * CGFloat(rows - 1)))
  for r in 0..<rows {
    let x = x0 + CGFloat(i) * d, y = y0 + CGFloat(r) * d
    let lit = r == h
    c.setFillColor(lit ? (t < 0.5 ? rgb(0x4a8ec4) : rgb(0xffb000)) : rgb(0x171920))
    c.fill(CGRect(x: x + d * 0.14, y: y + d * 0.14, width: d * 0.72, height: d * 0.72))
  }
}
try! img.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
