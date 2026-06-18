// cloudfunctions/getWxacode/index.js
// 调用微信 wxacode.getUnlimited 生成小程序码，返回 base64 图片字符串
// 前置条件：在微信云开发控制台「设置 → 通用设置」中开启「小程序码」权限

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  try {
    const page  = event.page  || 'pages/index/index'
    // getUnlimited 要求 scene 不能为空，至少 1 个字符，最多 32 个可见字符
    const scene = event.scene || '0'

    console.log('[getWxacode] calling getUnlimited, page:', page, 'scene:', scene)

    const result = await cloud.openapi.wxacode.getUnlimited({
      scene:      scene,
      page:       page,
      width:      280,
      autoColor:  false,
      lineColor:  { r: 28, g: 28, b: 30 },
      is_hyaline: true,   // 透明底色
      check_path: false    // 开发阶段不校验页面是否发布
    })

    console.log('[getWxacode] result type:', typeof result, 'has buffer:', !!result.buffer,
      result.buffer ? 'buffer len:' + result.buffer.length : 'no buffer')

    if (!result || !result.buffer) {
      return {
        code: -1,
        message: '微信接口返回数据异常：未获取到 buffer',
        rawType: typeof result
      }
    }

    // 将 buffer 转为 base64 字符串
    const base64 = Buffer.from(result.buffer).toString('base64')
    console.log('[getWxacode] success, base64 length:', base64.length)

    return {
      code: 0,
      data: { base64: 'data:image/png;base64,' + base64 }
    }
  } catch (err) {
    console.error('[getWxacode] error:', err)

    // 返回更详细的错误信息供前端调试
    const errMsg = err.message || '未知错误'
    const errCode = err.errCode || ''
    let suggestion = ''

    if (errCode === -604101) {
      suggestion = '请在小程序后台「开发 → 开发管理 → 接口设置」中申请开通「小程序码」权限'
    } else if (errCode === 85074) {
      suggestion = '小程序没有线上版本或 page 路径不存在'
    } else if (errCode === 85079) {
      suggestion = '小程序没有提交审核或审核未通过'
    }

    return {
      code: -1,
      message: errMsg,
      errCode: errCode,
      suggestion: suggestion
    }
  }
}
