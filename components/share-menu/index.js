// components/share-menu/index.js
const sync = require('../../utils/sync')
Component({
  properties: {
    item: {
      type: Object,
      value: {}
    }
  },

  data: {
    cardImagePath: '',
    isGenerating: false,
    generateError: false
  },

  lifetimes: {
    attached() {
      setTimeout(() => {
        this.generateCard()
      }, 400)
    }
  },

  methods: {
    // ============ 生成分享卡片 ============
    generateCard() {
      if (this.data.isGenerating) return
      this.setData({ isGenerating: true, generateError: false, cardImagePath: '' })

      const item = this.properties.item
      if (!item || !item.content) {
        this.setData({ isGenerating: false, generateError: true })
        return
      }

      const hasImages = item.images && item.images.length > 0

      // 获取小程序码
      const qrPromise = sync.getWxacode('pages/index/index', '').then(res => {
        if (res && res.code === 0 && res.data && res.data.base64) {
          return res.data.base64
        }
        return null
      }).catch(() => null)

      qrPromise.then(qrBase64 => {
        if (hasImages) {
          this._loadFirstImage(item.images[0], (imgObj) => {
            this._drawWithCanvas(item, imgObj, qrBase64)
          })
        } else {
          this._drawWithCanvas(item, null, qrBase64)
        }
      })
    },

    // 下载第一张图片
    _loadFirstImage(src, callback) {
      // 如果是本地临时路径直接用
      if (src && (src.startsWith('wxfile://') || src.startsWith('http://tmp/') || src.startsWith('/tmp/'))) {
        const img = this.createCanvas ? null : null
        callback(src)
        return
      }
      // cloud file ID 或 https 链接
      if (src && (src.startsWith('cloud://') || src.startsWith('https://'))) {
        wx.downloadFile({
          url: src.startsWith('cloud://') ? undefined : src,
          filePath: undefined,
          cloudPath: src.startsWith('cloud://') ? src : undefined,
          success: (res) => {
            callback(res.tempFilePath)
          },
          fail: () => {
            callback(null)
          }
        })
        return
      }
      // 其他情况直接用（临时路径）
      callback(src || null)
    },

    // ============ 绘制 Canvas ============
    _drawWithCanvas(item, localImagePath, qrBase64) {
      const query = this.createSelectorQuery()
      query.select('#shareCanvas')
        .fields({ node: true, size: true })
        .exec(async (res) => {
          if (!res || !res[0] || !res[0].node) {
            console.error('[share-menu] canvas node not found')
            this.setData({ isGenerating: false, generateError: true })
            return
          }

          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = wx.getSystemInfoSync().pixelRatio || 2

          // 卡片尺寸 750 × 高度（逻辑像素）
          const W = 750
          const hasImg = !!localImagePath
          const H = this._calcHeight(item, hasImg)

          canvas.width = W * dpr
          canvas.height = H * dpr
          ctx.scale(dpr, dpr)

          try {
            // 加载图片缩略图
            let imgObj = null
            if (localImagePath) {
              imgObj = await this._loadCanvasImage(canvas, localImagePath)
            }
            // 加载小程序码图片
            let qrImg = null
            if (qrBase64) {
              qrImg = await this._loadCanvasImage(canvas, qrBase64)
            }

            this._drawCard(ctx, canvas, item, W, H, imgObj, qrImg)

            wx.canvasToTempFilePath({
              canvas,
              x: 0,
              y: 0,
              width: W,
              height: H,
              destWidth: W * dpr,
              destHeight: H * dpr,
              fileType: 'jpg',
              quality: 0.95,
              success: (out) => {
                this.setData({
                  cardImagePath: out.tempFilePath,
                  isGenerating: false
                })
                this.triggerEvent('cardready', { path: out.tempFilePath })
              },
              fail: (err) => {
                console.error('[share-menu] export failed:', err)
                this.setData({ isGenerating: false, generateError: true })
              }
            })
          } catch (err) {
            console.error('[share-menu] draw failed:', err)
            this.setData({ isGenerating: false, generateError: true })
          }
        })
    },

    // 用 canvas.createImage 加载图片
    _loadCanvasImage(canvas, src) {
      return new Promise((resolve) => {
        const img = canvas.createImage()
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = src
      })
    },

    // 计算卡片高度
    _calcHeight(item, hasImg) {
      const content = item.content || ''
      const supplement = item.supplement || ''
      const FONT = 28
      const LINE_H = 46
      const MAX_W = 750 - 80 // 左右各 40px 内边距

      // 估算正文行数（粗略，中文1字≈fontSize宽度）
      const charPerLine = Math.floor(MAX_W / FONT)
      const contentLines = Math.min(12, Math.max(2, Math.ceil(content.length / charPerLine)))
      const suppLines = supplement ? Math.min(4, Math.max(1, Math.ceil(supplement.length / charPerLine))) : 0

      const textH = contentLines * LINE_H + (suppLines > 0 ? suppLines * 38 + 32 : 0)
      const imgH = hasImg ? 320 : 0  // 图片区高度
      const baseH = 200 + textH + imgH + 160 // 顶部品牌+分隔+底部署名+二维码区
      return Math.min(1600, Math.max(700, baseH))
    },

    // ============ 精美卡片绘制 ============
    _drawCard(ctx, canvas, item, W, H, imgObj, qrImg) {
      const P = 48 // 左右内边距

      // ========== 背景 ==========
      // 暖米白渐变背景
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#FFFDF9')
      bg.addColorStop(0.5, '#FFF8F0')
      bg.addColorStop(1, '#FFF3E4')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // 右上角装饰圆（淡橙色）
      ctx.fillStyle = 'rgba(251,191,36,0.08)'
      ctx.beginPath()
      ctx.arc(W - 30, 30, 200, 0, Math.PI * 2)
      ctx.fill()

      // 左下角装饰圆（淡绿色）
      ctx.fillStyle = 'rgba(16,185,129,0.06)'
      ctx.beginPath()
      ctx.arc(60, H - 60, 180, 0, Math.PI * 2)
      ctx.fill()

      // ========== 顶部渐变色条 ==========
      const topBar = ctx.createLinearGradient(0, 0, W, 0)
      topBar.addColorStop(0, '#10B981')
      topBar.addColorStop(0.6, '#34D399')
      topBar.addColorStop(1, '#6EE7B7')
      ctx.fillStyle = topBar
      // 圆角矩形（上两角圆角）
      this._roundRect(ctx, 0, 0, W, 12, { tl: 0, tr: 0, br: 0, bl: 0 })
      ctx.fill()

      // ========== 品牌区 ==========
      let y = 52

      // App 图标圆形背景
      ctx.fillStyle = '#10B981'
      this._roundRect(ctx, P, y, 52, 52, 14)
      ctx.fill()

      // App 图标：闪光 ✦ 符号
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 30px "PingFang SC", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('✦', P + 26, y + 27)

      // App 名称
      ctx.fillStyle = '#10B981'
      ctx.font = 'bold 32px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('记灵感', P + 62, y + 18)

      // 副标题
      ctx.fillStyle = '#9CA3AF'
      ctx.font = '20px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.fillText('捕捉你的灵感一现', P + 62, y + 40)

      y += 72

      // ========== 横线分隔 ==========
      ctx.strokeStyle = '#F0E8D8'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(P, y)
      ctx.lineTo(W - P, y)
      ctx.stroke()

      y += 36

      // ========== 大引号装饰 ==========
      ctx.fillStyle = '#10B981'
      ctx.globalAlpha = 0.12
      ctx.font = 'bold 110px Georgia, "Times New Roman", serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('\u201C', P - 6, y - 20)
      ctx.globalAlpha = 1

      // ========== 灵感正文 ==========
      const content = item.content || ''
      const maxW = W - P * 2
      ctx.fillStyle = '#1A1A2E'
      ctx.font = '28px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'

      const contentLines = this._wrapText(ctx, content, maxW, 12)
      const maxShowLines = 10
      const showLines = contentLines.slice(0, maxShowLines)
      const hasMore = contentLines.length > maxShowLines

      for (const line of showLines) {
        ctx.fillText(line, P, y)
        y += 46
      }
      if (hasMore) {
        ctx.fillStyle = '#9CA3AF'
        ctx.font = '24px "PingFang SC", sans-serif'
        ctx.fillText('...', P, y)
        y += 36
      }

      // ========== 补充内容 ==========
      if (item.supplement) {
        y += 16
        ctx.fillStyle = '#6B7280'
        ctx.font = 'italic 22px "PingFang SC", "Microsoft YaHei", sans-serif'
        const suppLines = this._wrapText(ctx, item.supplement, maxW, 10)
        for (const line of suppLines.slice(0, 4)) {
          ctx.fillText(line, P, y)
          y += 34
        }
      }

      y += 32

      // ========== 图片缩略图 ==========
      if (imgObj) {
        // 绘制圆角图片
        const imgH = 300
        const imgW = W - P * 2
        ctx.save()
        this._roundRect(ctx, P, y, imgW, imgH, 16)
        ctx.clip()
        ctx.drawImage(imgObj, P, y, imgW, imgH)
        ctx.restore()

        // 图片边框
        ctx.strokeStyle = 'rgba(0,0,0,0.06)'
        ctx.lineWidth = 1
        this._roundRect(ctx, P, y, imgW, imgH, 16)
        ctx.stroke()

        y += imgH + 28
      }

      // ========== 横线分隔 ==========
      ctx.strokeStyle = '#F0E8D8'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(P, y)
      ctx.lineTo(W - P, y)
      ctx.stroke()

      y += 28

      // ========== 底部：日期 + 标签 ==========
      const date = item.createdAt ? new Date(item.createdAt) : new Date()
      const dateStr = date.getFullYear() + '.' +
        String(date.getMonth() + 1).padStart(2, '0') + '.' +
        String(date.getDate()).padStart(2, '0')
      const timeStr = String(date.getHours()).padStart(2, '0') + ':' +
        String(date.getMinutes()).padStart(2, '0')

      ctx.fillStyle = '#9CA3AF'
      ctx.font = '20px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(dateStr + '  ' + timeStr, P, y + 16)

      // 标签（最多2个）
      if (item.tags && item.tags.length > 0) {
        let tagX = P
        // 测量日期宽度
        const dateW = ctx.measureText(dateStr + '  ' + timeStr).width
        tagX = P + dateW + 20
        const showTags = item.tags.slice(0, 2)
        for (const tag of showTags) {
          const tagText = '#' + tag
          const tagW = ctx.measureText(tagText).width + 18
          ctx.fillStyle = '#E8F8EE'
          this._roundRect(ctx, tagX, y + 4, tagW, 24, 12)
          ctx.fill()
          ctx.fillStyle = '#10B981'
          ctx.font = '18px "PingFang SC", sans-serif'
          ctx.fillText(tagText, tagX + 9, y + 16)
          tagX += tagW + 10
        }
      }

      y += 48

      // ========== 二维码区域 ==========
      const qrSize = 100
      const qrX = W - P - qrSize
      const qrY = y

      // 二维码背景白框
      ctx.fillStyle = '#FFFFFF'
      this._roundRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 12)
      ctx.fill()
      ctx.strokeStyle = '#E5E7EB'
      ctx.lineWidth = 1
      this._roundRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 12)
      ctx.stroke()

      if (qrImg) {
        // 使用真实小程序码
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)
      } else {
        // 绘制模拟二维码图案（兜底）
        this._drawQRPlaceholder(ctx, qrX, qrY, qrSize)
      }

      // 二维码下方说明文字
      ctx.fillStyle = '#9CA3AF'
      ctx.font = '18px "PingFang SC", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText('扫码查看', qrX + qrSize / 2, qrY + qrSize + 12)

      // 左侧文案
      ctx.fillStyle = '#374151'
      ctx.font = 'bold 26px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('记灵感', P, qrY + 20)

      ctx.fillStyle = '#9CA3AF'
      ctx.font = '20px "PingFang SC", sans-serif'
      ctx.fillText('好灵感分享给朋友', P, qrY + 52)
      ctx.fillText('一起捕捉灵感一现', P, qrY + 76)
    },

    // ========== 绘制二维码占位图案 ==========
    _drawQRPlaceholder(ctx, x, y, size) {
      const cell = size / 9
      // 定义一个简化版二维码矩阵（模拟定位码 + 数据码）
      const matrix = [
        [1,1,1,1,1,1,1,0,1,0,1,0,0,0,1,1,1,1,1,1,1,0,0,0,1,1,1],
        [1,0,0,0,0,0,1,0,0,1,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0],
        [1,0,1,1,1,0,1,0,1,0,1,1,0,0,1,0,1,1,1,0,1,0,0,0,1,1,0],
        [1,0,1,1,1,0,1,0,0,0,0,1,1,0,1,0,1,1,1,0,1,0,0,0,0,0,1],
        [1,0,1,1,1,0,1,0,1,1,0,0,1,0,1,0,1,1,1,0,1,0,0,0,0,1,0],
        [1,0,0,0,0,0,1,0,0,0,1,1,0,0,1,0,0,0,0,0,1,0,0,0,1,0,0],
        [1,1,1,1,1,1,1,0,1,0,1,0,1,0,1,1,1,1,1,1,1,0,0,0,0,1,1],
        [0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0],
        [1,0,1,1,0,1,1,1,0,1,1,0,1,1,1,0,1,1,0,1,0,1,1,1,0,0,1],
      ]

      ctx.fillStyle = '#1A1A2E'
      const cellSize = size / 27

      for (let row = 0; row < matrix.length; row++) {
        for (let col = 0; col < matrix[row].length; col++) {
          if (matrix[row][col] === 1) {
            ctx.fillRect(
              x + col * cellSize,
              y + row * cellSize,
              cellSize - 0.5,
              cellSize - 0.5
            )
          }
        }
      }

      // 填充剩余行（中间区域随机数据点）
      for (let row = matrix.length; row < 27; row++) {
        for (let col = 0; col < 27; col++) {
          // 跳过左下角定位码区域
          if (col < 7 && row > 19) continue
          const seed = (row * 37 + col * 17 + row + col) % 3
          if (seed === 0) {
            ctx.fillRect(
              x + col * cellSize,
              y + row * cellSize,
              cellSize - 0.5,
              cellSize - 0.5
            )
          }
        }
      }

      // 左下角定位码
      const ldX = x
      const ldY = y + 20 * cellSize
      ctx.fillStyle = '#1A1A2E'
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const on = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
          if (on) ctx.fillRect(ldX + c * cellSize, ldY + r * cellSize, cellSize - 0.5, cellSize - 0.5)
        }
      }
    },

    // ========== 工具：绘制圆角矩形路径 ==========
    _roundRect(ctx, x, y, w, h, r) {
      if (typeof r === 'number') {
        r = { tl: r, tr: r, br: r, bl: r }
      }
      ctx.beginPath()
      ctx.moveTo(x + r.tl, y)
      ctx.lineTo(x + w - r.tr, y)
      ctx.arcTo(x + w, y, x + w, y + r.tr, r.tr)
      ctx.lineTo(x + w, y + h - r.br)
      ctx.arcTo(x + w, y + h, x + w - r.br, y + h, r.br)
      ctx.lineTo(x + r.bl, y + h)
      ctx.arcTo(x, y + h, x, y + h - r.bl, r.bl)
      ctx.lineTo(x, y + r.tl)
      ctx.arcTo(x, y, x + r.tl, y, r.tl)
      ctx.closePath()
    },

    // ========== 工具：文本换行 ==========
    _wrapText(ctx, text, maxWidth, maxLines) {
      const lines = []
      // 先按换行符分割
      const paragraphs = text.split('\n')
      for (const para of paragraphs) {
        if (maxLines && lines.length >= maxLines) break
        if (!para) {
          lines.push('')
          continue
        }
        let current = ''
        for (let i = 0; i < para.length; i++) {
          const ch = para[i]
          const test = current + ch
          if (ctx.measureText(test).width > maxWidth && current.length > 0) {
            lines.push(current)
            current = ch
            if (maxLines && lines.length >= maxLines) break
          } else {
            current = test
          }
        }
        if (current) lines.push(current)
      }
      return lines
    },

    // ============ 保存到相册 ============
    onSaveToAlbum() {
      if (!this.data.cardImagePath) return
      wx.saveImageToPhotosAlbum({
        filePath: this.data.cardImagePath,
        success: () => {
          wx.showToast({ title: '已保存到相册', icon: 'success' })
          this.triggerEvent('close')
        },
        fail: (err) => {
          if (err.errMsg && (err.errMsg.includes('auth deny') || err.errMsg.includes('deny'))) {
            wx.showModal({
              title: '需要相册权限',
              content: '请在设置中允许小程序保存图片到相册',
              showCancel: false,
              confirmText: '去设置',
              success: (res) => {
                if (res.confirm) wx.openSetting()
              }
            })
          } else {
            wx.showToast({ title: '保存失败，请重试', icon: 'none' })
          }
        }
      })
    },

    // ============ 复制文案 ============
    onCopyText() {
      const item = this.properties.item
      const date = item.createdAt ? new Date(item.createdAt) : new Date()
      const dateStr = date.getFullYear() + '.' +
        String(date.getMonth() + 1).padStart(2, '0') + '.' +
        String(date.getDate()).padStart(2, '0')
      const tagStr = (item.tags && item.tags.length > 0)
        ? item.tags.map(t => '#' + t).join(' ')
        : ''
      const text = [
        item.content || '',
        item.supplement ? '\n' + item.supplement : '',
        '',
        tagStr ? tagStr + '\n' : '',
        '—— ' + dateStr + ' · 记灵感'
      ].filter(s => s !== '').join('\n')

      wx.setClipboardData({
        data: text,
        success: () => {
          wx.showToast({ title: '已复制', icon: 'success' })
        }
      })
    },

    // ============ 重新生成 ============
    onRetry() {
      this.generateCard()
    },

    // ============ 关闭 ============
    onClose() {
      this.triggerEvent('close')
    },
    onStopPropagation() {}
  }
})
