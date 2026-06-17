// components/share-menu/index.js
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
      // 延迟一下等 DOM 渲染 canvas
      setTimeout(() => {
        this.generateCard()
      }, 300)
    }
  },

  methods: {
    // ============ 生成分享卡片 ============
    generateCard() {
      if (this.data.isGenerating) return
      this.setData({ isGenerating: true, generateError: false })

      const item = this.properties.item
      const query = this.createSelectorQuery()
      query.select('#shareCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            console.error('[share-menu] canvas node not found')
            this.setData({ isGenerating: false, generateError: true })
            return
          }

          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = wx.getSystemInfoSync().pixelRatio || 2

          // 卡片尺寸：750 × 动态高度
          const width = 750
          const height = this.calcCardHeight(item)

          canvas.width = width * dpr
          canvas.height = height * dpr
          ctx.scale(dpr, dpr)

          // 绘制卡片
          try {
            this.drawCard(ctx, item, width, height)

            // 导出图片
            wx.canvasToTempFilePath({
              canvas,
              x: 0,
              y: 0,
              width: width,
              height: height,
              destWidth: width,
              destHeight: height,
              fileType: 'jpg',
              quality: 0.95,
              success: (out) => {
                this.setData({
                  cardImagePath: out.tempFilePath,
                  isGenerating: false
                })
                // 通知父页面卡片已生成
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

    // 计算卡片高度（根据内容长度）
    calcCardHeight(item) {
      const content = item.content || ''
      const supplement = item.supplement || ''
      // 粗略估算：中文每行约 25 字，行高 42px
      const contentLines = Math.max(1, Math.ceil(this.measureTextWidth(content, 26) / (750 - 120)))
      const suppLines = supplement ? Math.max(1, Math.ceil(this.measureTextWidth(supplement, 22) / (750 - 120))) + 1 : 0
      const textHeight = contentLines * 44 + suppLines * 34
      return Math.min(1400, Math.max(700, 320 + textHeight))
    },

    // 估算文本像素宽度
    measureTextWidth(text, fontSize) {
      let width = 0
      for (const ch of text) {
        width += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? fontSize : fontSize * 0.6
      }
      return width
    },

    // ============ Canvas 绘制 ============
    drawCard(ctx, item, W, H) {
      const P = 56 // 内边距

      // ---- 背景 ----
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#FEFDFB')
      bg.addColorStop(0.4, '#FFF9F5')
      bg.addColorStop(1, '#FFF3EA')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // ---- 顶部渐变条 ----
      const topBar = ctx.createLinearGradient(0, 0, W, 0)
      topBar.addColorStop(0, '#10B981')
      topBar.addColorStop(0.5, '#34D399')
      topBar.addColorStop(1, '#6EE7B7')
      ctx.fillStyle = topBar
      ctx.fillRect(0, 0, W, 10)

      // ---- 品牌标题 ----
      ctx.fillStyle = '#10B981'
      ctx.font = 'bold 30px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // 标题左边小装饰点
      const titleY = 68
      const titleText = '记 灵 感'
      const titleWidth = ctx.measureText(titleText).width
      const titleLeft = (W - titleWidth) / 2 - 30

      // 装饰点
      ctx.fillStyle = '#FBBF24'
      ctx.beginPath()
      ctx.arc(titleLeft - 16, titleY, 6, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#10B981'
      ctx.fillText(titleText, W / 2, titleY)

      ctx.fillStyle = '#FBBF24'
      ctx.beginPath()
      ctx.arc(titleLeft + titleWidth + 46, titleY, 6, 0, Math.PI * 2)
      ctx.fill()

      // ---- 分隔线 ----
      const lineY1 = 120
      ctx.strokeStyle = '#E5E7EB'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(P, lineY1)
      ctx.lineTo(W - P, lineY1)
      ctx.stroke()

      // ---- 引用装饰 ----
      ctx.fillStyle = '#10B981'
      ctx.globalAlpha = 0.15
      ctx.font = 'bold 80px Georgia, serif'
      ctx.textAlign = 'left'
      ctx.fillText('"', P - 4, lineY1 + 68)
      ctx.globalAlpha = 1

      // ---- 正文内容 ----
      const content = item.content || ''
      const maxWidth = W - P * 2
      ctx.fillStyle = '#1F2937'
      ctx.font = '26px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'

      const lines = this.wrapCanvasText(ctx, content, maxWidth, 42)
      let y = lineY1 + 50
      for (const line of lines) {
        ctx.fillText(line, P, y)
        y += 42
      }

      // ---- 补充内容 ----
      if (item.supplement) {
        y += 28
        ctx.fillStyle = '#6B7280'
        ctx.font = '20px "PingFang SC", "Microsoft YaHei", sans-serif'
        const suppLines = this.wrapCanvasText(ctx, item.supplement, maxWidth, 32)
        for (const line of suppLines) {
          ctx.fillText(line, P, y)
          y += 32
        }
      }

      // 留出间距
      y += 40

      // ---- 底部装饰线 ----
      ctx.strokeStyle = '#E5E7EB'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(P, y)
      ctx.lineTo(W - P, y)
      ctx.stroke()

      // ---- 日期 + 品牌 ----
      y += 40
      const date = item.createdAt ? new Date(item.createdAt) : new Date()
      const dateStr = date.getFullYear() + '.' +
        String(date.getMonth() + 1).padStart(2, '0') + '.' +
        String(date.getDate()).padStart(2, '0') + '  ' +
        String(date.getHours()).padStart(2, '0') + ':' +
        String(date.getMinutes()).padStart(2, '0')

      ctx.fillStyle = '#9CA3AF'
      ctx.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(dateStr, P, y)

      ctx.textAlign = 'right'
      ctx.fillStyle = '#D1D5DB'
      ctx.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.fillText('记灵感 · 捕捉你的灵感一现', W - P, y)

      // ---- 右下角 Logo 装饰 ----
      y += 16
      ctx.fillStyle = '#10B981'
      ctx.globalAlpha = 0.12
      ctx.font = 'bold 120px Georgia, serif'
      ctx.textAlign = 'right'
      ctx.fillText('✦', W - P + 10, y + 100)
      ctx.globalAlpha = 1
    },

    // Canvas 文本换行
    wrapCanvasText(ctx, text, maxWidth, lineHeight) {
      const lines = []
      let current = ''
      for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        const test = current + ch
        const metrics = ctx.measureText(test)
        if (metrics.width > maxWidth && current.length > 0) {
          lines.push(current)
          current = ch
        } else {
          current = test
        }
      }
      if (current) lines.push(current)
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
          if (err.errMsg.includes('auth deny') || err.errMsg.includes('deny')) {
            wx.showModal({
              title: '需要相册权限',
              content: '请在设置中允许小程序保存图片到相册',
              showCancel: false,
              confirmText: '去设置',
              success: (res) => {
                if (res.confirm) {
                  wx.openSetting()
                }
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
      const text = [
        '📝 灵感卡片',
        '',
        item.content || '',
        item.supplement ? '\n' + item.supplement : '',
        '',
        '—— ' + dateStr + ' · 记灵感'
      ].filter(Boolean).join('\n')

      wx.setClipboardData({
        data: text,
        success: () => {
          wx.showToast({ title: '已复制', icon: 'success' })
          this.triggerEvent('close')
        }
      })
    },

    // ============ 关闭 ============
    onClose() {
      this.triggerEvent('close')
    },
    onStopPropagation() {}
  }
})
