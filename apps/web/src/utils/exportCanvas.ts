// ============================================
// 画布导出工具 - 纯函数，不依赖 React
// 与 FabricController 的 exportPNG/exportSVG/exportJSON 共用本实现
// ============================================

/** 导出画布为 PNG dataURL（客户效果图） */
export function exportToPNG(canvas: any): string {
  return canvas.toDataURL({ format: 'png', quality: 1, multiplier: 1 })
}

/** 导出画布为 SVG 字符串（矢量交付文件） */
export function exportToSVG(canvas: any): string {
  return canvas.toSVG()
}

/** 导出画布为 JSON 对象（项目源文件，可再次编辑）
 *  @param propertiesToInclude 需要额外序列化的自定义属性（如图层 id/材质）
 */
export function exportToJson(canvas: any, propertiesToInclude?: string[]): object {
  return propertiesToInclude ? canvas.toJSON(propertiesToInclude) : canvas.toJSON()
}
