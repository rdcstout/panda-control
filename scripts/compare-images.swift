import AppKit
import Foundation

guard CommandLine.arguments.count == 4 else {
  fatalError("Usage: compare-images.swift reference.png implementation.png output.png")
}

let referenceURL = URL(fileURLWithPath: CommandLine.arguments[1])
let implementationURL = URL(fileURLWithPath: CommandLine.arguments[2])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[3])

guard let reference = NSImage(contentsOf: referenceURL),
      let implementation = NSImage(contentsOf: implementationURL) else {
  fatalError("Could not load input images")
}

let canvasSize = NSSize(width: reference.size.width * 2, height: reference.size.height)
let canvas = NSImage(size: canvasSize)
canvas.lockFocus()
NSColor.black.setFill()
NSRect(origin: .zero, size: canvasSize).fill()
reference.draw(in: NSRect(x: 0, y: 0, width: reference.size.width, height: reference.size.height))
implementation.draw(in: NSRect(x: reference.size.width, y: 0, width: reference.size.width, height: reference.size.height))
canvas.unlockFocus()

guard let tiff = canvas.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
  fatalError("Could not render comparison")
}
try png.write(to: outputURL)
