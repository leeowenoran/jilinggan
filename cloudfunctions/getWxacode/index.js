// cloudfunctions/getWxacode/index.js
// 调用微信 wxacode.getUnlimited 生成小程序码，返回 base64 图片字符串
// 前置条件：在微信云开发控制台「设置 → 服务设置」中开启 wxacode.getUnlimited

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  try {
    // event.page：跳转页面路径，如 "pages/detail/detail"
    // event.scene：scene 参数（最长 32 个可见字符），用于携带 localId 等参数
    const page  = event.page  || 'pages/index/index'
    const scene = event.scene || ''

    const result = await cloud.openapi.wxacode.getUnlimited({
      scene:      scene,
      page:       page,
      width:      280,    // 二维码宽度（px），生成 280px 足够海报使用
      autoColor:  false,
      lineColor:  { r: 28, g: 28, b: 30 },  // #1C1C1E 深灰（苹果色），与白底海报搭配
      is_hyaline: true,   // 背景透明（蛇形命名，非驼峰）
      check_path: false   // 不校验 page 是否发布，开发阶段可用
    })

    // 云函数运行在 Node.js 环境，不能用 wx.arrayBufferToBase64
    // 正确做法：将 buffer 转为 base64 字符串
    const base64 = Buffer.from(result.buffer).toString('base64')
    return {
      code: 0,
      data: { base64: 'data:image/png;base64,' + base64 }
    }
  } catch (err) {
    console.error('getWxacode error:', err)
    return {
      code: -1,
      message: err.message || '生成二维码失败',
      errCode: err.errCode
    }
  }
}
