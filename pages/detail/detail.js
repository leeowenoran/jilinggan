// pages/detail/detail.js
const storage = require('../../utils/storage')
const sync = require('../../utils/sync')

Page({
  data: {
    localId: '',
    item: null,
    isEditing: false,
    editContent: '',
    editSupplement: '',
    isDeleting: false,
    showShareMenu: false,
    shareCardPath: '',
    shareGenerating: false,
    shareError: false,
    imageList: [],
    projectName: '',
    displayDate: '',
    displayTime: ''
  },

  onLoad(options) {
    const localId = options.localId
    if (!localId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1000)
      return
    }
    this.setData({ localId })
    this.loadItem(localId)

    if (options.openShare === '1') {
      setTimeout(() => {
        if (this.data.item && this.data.item.content) {
          this.onShare()
        }
      }, 800)
    }
  },

  onShow() {
    if (this.data.localId) {
      this.loadItem(this.data.localId)
    }
  },

  loadItem(localId) {
    const id = localId || this.data.localId
    if (!id) return
    const item = storage.getInspirationByLocalId(id)
    if (!item || item.isDeleted) {
      wx.showToast({ title: '灵感已被删除', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1000)
      return
    }
    this._renderItem(item)
    sync.getDetail(id).then(res => {
      if (res && res.code === 0 && res.data && res.data.item) {
        const cloudItem = res.data.item
        const merged = { ...item, ...cloudItem, _projectName: item._projectName }
        storage.updateInspiration(id, cloudItem)
        this._renderItem(merged)
      }
    }).catch(() => {})
  },

  _renderItem(item) {
    const createdAt = new Date(item.createdAt)
    const dateStr = createdAt.getFullYear() + '年' +
      (createdAt.getMonth() + 1) + '月' + createdAt.getDate() + '日'
    const timeStr = String(createdAt.getHours()).padStart(2, '0') + ':' +
      String(createdAt.getMinutes()).padStart(2, '0')

    let projectName = ''
    if (item.projectId) {
      const project = storage.getProjectById(item.projectId)
      if (project) projectName = project.name
    }

    this.setData({
      item,
      imageList: item.images || [],
      projectName,
      displayDate: dateStr,
      displayTime: timeStr,
      editContent: item.content || '',
      editSupplement: item.supplement || ''
    })
  },

  // ==================== 分享卡片生成（页面级 Canvas，告别组件生命周期问题）====================

  onShare() {
    console.log('[detail] onShare called')
    const item = this.data.item
    if (!item) {
      console.warn('[detail] onShare: item is null')
      wx.showToast({ title: '数据加载中', icon: 'none' })
      return
    }
    // 放宽条件：有文字内容或有图片都可以分享
    const hasContent = item.content && item.content.trim()
    const hasImages = item.images && item.images.length > 0
    if (!hasContent && !hasImages) {
      console.warn('[detail] onShare: no content and no images')
      wx.showToast({ title: '暂无内容可分享', icon: 'none' })
      return
    }
    console.log('[detail] onShare: opening share menu, hasContent:', hasContent, 'hasImages:', hasImages)
    this.setData({ showShareMenu: true, shareGenerating: true, shareError: false, shareCardPath: '' })
    // 页面 onReady 已过，Canvas 节点已存在，直接开始生成
    this._generateShareCard(item)
  },

  _generateShareCard(item) {
    const self = this
    // 步骤1：查询 Canvas 节点
    const query = wx.createSelectorQuery()
    query.select('#shareCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          console.error('[detail] shareCanvas node not found')
          self.setData({ shareGenerating: false, shareError: true })
          return
        }
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getSystemInfoSync().pixelRatio || 2

        // 步骤2：并行加载图片和小程序码
        const hasImages = item.images && item.images.length > 0
        const imagePromise = hasImages ? self._loadImagesForCard(item.images) : Promise.resolve([])
        const qrPromise = self._getWxacodeForCard()

        Promise.all([imagePromise, qrPromise]).then(([imagePaths, qrBase64]) => {
          // 步骤3：在 Canvas 上绘制
          self._drawShareCard(canvas, ctx, item, imagePaths, qrBase64, dpr)
        }).catch(err => {
          console.error('[detail] load resources failed:', err)
          self.setData({ shareGenerating: false, shareError: true })
        })
      })
  },

  _loadImagesForCard(images) {
    const promises = images.map((src, index) => {
      return new Promise((resolve) => {
        if (!src) { resolve(null); return }
        if (src.startsWith('cloud://')) {
          wx.cloud.downloadFile({
            fileID: src,
            success: (res) => resolve({ index, path: res.tempFilePath }),
            fail: () => resolve(null)
          })
        } else if (src.startsWith('https://')) {
          wx.downloadFile({
            url: src,
            success: (res) => resolve({ index, path: res.tempFilePath }),
            fail: () => resolve(null)
          })
        } else {
          resolve({ index, path: src })
        }
      })
    })
    return Promise.all(promises).then(results =>
      results.filter(r => r !== null).sort((a, b) => a.index - b.index).map(r => r.path)
    )
  },

  _getWxacodeForCard() {
    console.log('[detail] calling getWxacode...')
    return sync.getWxacode('pages/index/index', '').then(res => {
      console.log('[detail] getWxacode raw result:', JSON.stringify({ code: res?.code, hasData: !!res?.data, base64Len: res?.data?.base64?.length }))
      if (res && res.code === 0 && res.data && res.data.base64) {
        console.log('[detail] getWxacode OK, base64 length:', res.data.base64.length)
        return res.data.base64
      }
      console.warn('[detail] getWxacode returned unexpected:', JSON.stringify(res).substring(0, 200))
      return null
    }).catch(err => {
      console.error('[detail] getWxacode error:', JSON.stringify(err))
      return null
    })
  },

  _drawShareCard(canvas, ctx, item, imagePaths, qrBase64, dpr) {
    const self = this
    const W = 750
    const H = this._calcCardHeight(item, imagePaths)

    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    // 加载 Canvas 图片对象
    const loadCanvasImg = (src) => {
      return new Promise((resolve) => {
        if (!src) { resolve(null); return }
        const tryLoad = (finalSrc) => {
          const img = canvas.createImage()
          img.onload = () => resolve(img)
          img.onerror = () => {
            console.warn('[detail] canvas image load error for:', finalSrc?.substring(0, 40))
            resolve(null)
          }
          img.src = finalSrc
        }
        if (src.startsWith('data:image')) {
          try {
            const fsm = wx.getFileSystemManager()
            const commaIdx = src.indexOf(',')
            const base64Data = commaIdx > 0 ? src.substring(commaIdx + 1) : src
            const filePath = wx.env.USER_DATA_PATH + '/qrcode_' + Date.now() + '.png'
            // 用同步写文件，比异步更可靠
            fsm.writeFileSync(filePath, base64Data, 'base64')
            console.log('[detail] QR code saved to file:', filePath)
            tryLoad(filePath)
          } catch (e) {
            console.error('[detail] writeFileSync failed:', e)
            // 兜底：尝试直接用 data URI
            tryLoad(src)
          }
        } else {
          tryLoad(src)
        }
      })
    }

    const loadTasks = []

    // 加载图片
    for (const p of (imagePaths || [])) {
      loadTasks.push(loadCanvasImg(p))
    }
    // 加载小程序码
    loadTasks.push(loadCanvasImg(qrBase64))

    Promise.all(loadTasks).then(results => {
      const imgObjects = results.slice(0, results.length - 1).filter(Boolean)
      const qrImg = results[results.length - 1]

      console.log('[detail] share card: imgObjects count:', imgObjects.length, 'qrImg loaded:', !!qrImg, 'qrBase64 source:', qrBase64 ? (qrBase64.substring(0, 30) + '...') : 'null')

      // ========== 绘制背景 ==========
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#FFFDF9')
      bg.addColorStop(0.5, '#FFF8F0')
      bg.addColorStop(1, '#FFF3E4')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      ctx.fillStyle = 'rgba(251,191,36,0.08)'
      ctx.beginPath(); ctx.arc(W - 30, 30, 200, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(16,185,129,0.06)'
      ctx.beginPath(); ctx.arc(60, H - 60, 180, 0, Math.PI * 2); ctx.fill()

      // 顶部色条
      const topBar = ctx.createLinearGradient(0, 0, W, 0)
      topBar.addColorStop(0, '#10B981'); topBar.addColorStop(0.6, '#34D399'); topBar.addColorStop(1, '#6EE7B7')
      ctx.fillStyle = topBar; ctx.fillRect(0, 0, W, 10)

      const P = 48
      let y = 52

      // 品牌区
      ctx.fillStyle = '#10B981'
      self._roundRectPath(ctx, P, y, 56, 56, 14); ctx.fill()
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 30px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('✦', P + 28, y + 28)

      ctx.fillStyle = '#10B981'; ctx.font = 'bold 34px "PingFang SC","Microsoft YaHei",sans-serif'
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText('记灵感', P + 72, y + 20)
      ctx.fillStyle = '#9CA3AF'; ctx.font = '20px "PingFang SC","Microsoft YaHei",sans-serif'
      ctx.fillText('捕捉你的灵感一现', P + 72, y + 48)
      y += 88

      // 分隔线
      ctx.strokeStyle = '#F0E8D8'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke()
      y += 36

      // 大引号
      ctx.fillStyle = '#10B981'; ctx.globalAlpha = 0.12
      ctx.font = 'bold 110px Georgia,"Times New Roman",serif'
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText('\u201C', P - 6, y - 20); ctx.globalAlpha = 1

      // 正文
      const maxW = W - P * 2
      ctx.fillStyle = '#1A1A2E'; ctx.font = '28px "PingFang SC","Microsoft YaHei",sans-serif'
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      const contentLines = self._wrapText(ctx, item.content || '', maxW, 12)
      const showLines = contentLines.slice(0, 10)
      for (const line of showLines) { ctx.fillText(line, P, y); y += 46 }
      if (contentLines.length > 10) {
        ctx.fillStyle = '#9CA3AF'; ctx.font = '24px sans-serif'; ctx.fillText('...', P, y); y += 36
      }

      // 补充
      if (item.supplement) {
        y += 16
        ctx.fillStyle = '#6B7280'; ctx.font = 'italic 22px "PingFang SC","Microsoft YaHei",sans-serif'
        const suppLines = self._wrapText(ctx, item.supplement, maxW, 10)
        for (const line of suppLines.slice(0, 4)) { ctx.fillText(line, P, y); y += 34 }
      }
      y += 32

      // 图片网格（3列）
      if (imgObjects.length > 0) {
        const gap = 10; const imgSize = (W - P * 2 - gap * 2) / 3
        const show = imgObjects.slice(0, 9)
        for (let i = 0; i < show.length; i++) {
          const row = Math.floor(i / 3), col = i % 3
          const ix = P + col * (imgSize + gap), iy = y + row * (imgSize + gap)
          ctx.save(); self._roundRectPath(ctx, ix, iy, imgSize, imgSize, 8); ctx.clip()
          ctx.drawImage(show[i], ix, iy, imgSize, imgSize); ctx.restore()
          ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1
          self._roundRectPath(ctx, ix, iy, imgSize, imgSize, 8); ctx.stroke()
        }
        y += Math.ceil(show.length / 3) * imgSize + (Math.ceil(show.length / 3) - 1) * gap + 28
      }

      // 标签
      if (item.tags && item.tags.length > 0) {
        y += 8; let tagX = P
        for (const tag of item.tags.slice(0, 3)) {
          ctx.font = '18px sans-serif'
          const tw = ctx.measureText('#' + tag).width + 18
          ctx.fillStyle = '#E8F8EE'; self._roundRectPath(ctx, tagX, y, tw, 24, 12); ctx.fill()
          ctx.fillStyle = '#10B981'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
          ctx.fillText('#' + tag, tagX + 9, y + 12); tagX += tw + 10
        }
        y += 40
      }

      // 分隔线
      ctx.strokeStyle = '#F0E8D8'
      ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke()
      y += 28

      // 日期
      const date = item.createdAt ? new Date(item.createdAt) : new Date()
      const ds = date.getFullYear() + '.' + String(date.getMonth() + 1).padStart(2, '0') + '.' + String(date.getDate()).padStart(2, '0')
      const ts = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
      ctx.fillStyle = '#9CA3AF'; ctx.font = '20px "PingFang SC","Microsoft YaHei",sans-serif'
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(ds + '  ' + ts, P, y + 16)
      y += 48

      // 二维码
      const qrSize = 120, qrX = W - P - qrSize, qrY = y - 20
      ctx.fillStyle = '#FFFFFF'; self._roundRectPath(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 12); ctx.fill()
      ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 1; self._roundRectPath(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 12); ctx.stroke()
      if (qrImg) { ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize) }
      else {
        console.warn('[detail] using FAKE QR code — real QR failed to load')
        self._drawFakeQR(ctx, qrX, qrY, qrSize)
      }
      ctx.fillStyle = '#9CA3AF'; ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('扫码查看', qrX + qrSize / 2, qrY + qrSize + 12)
      ctx.fillStyle = '#374151'; ctx.font = 'bold 26px "PingFang SC","Microsoft YaHei",sans-serif'
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('记灵感', P, qrY + 20)
      ctx.fillStyle = '#9CA3AF'; ctx.font = '20px sans-serif'; ctx.fillText('好灵感分享给朋友', P, qrY + 52); ctx.fillText('一起捕捉灵感一现', P, qrY + 76)

      // 导出
      setTimeout(() => {
        wx.canvasToTempFilePath({
          canvas, x: 0, y: 0, width: W, height: H, destWidth: W * dpr, destHeight: H * dpr,
          fileType: 'jpg', quality: 0.95,
          success: (out) => {
            self.setData({ shareCardPath: out.tempFilePath, shareGenerating: false, shareError: false })
          },
          fail: (err) => {
            console.error('[detail] canvasToTempFilePath fail:', err)
            self.setData({ shareGenerating: false, shareError: true })
          }
        })
      }, 300)
    }).catch(err => {
      console.error('[detail] load canvas images fail:', err)
      self.setData({ shareGenerating: false, shareError: true })
    })
  },

  _calcCardHeight(item, imagePaths) {
    const P = 48, MAX_W = 750 - P * 2, FONT = 28, LINE_H = 46
    const contentLines = Math.min(12, Math.max(2, Math.ceil((item.content || '').length / Math.floor(MAX_W / FONT))))
    const suppLines = item.supplement ? Math.min(4, Math.ceil(item.supplement.length / Math.floor(MAX_W / FONT))) : 0
    const textH = contentLines * LINE_H + (suppLines > 0 ? suppLines * 38 + 32 : 0)
    let imgH = 0
    if (imagePaths && imagePaths.length > 0) {
      const gap = 10, imgSize = (750 - P * 2 - gap * 2) / 3
      const rows = Math.ceil(Math.min(imagePaths.length, 9) / 3)
      imgH = rows * imgSize + (rows - 1) * gap + 20
    }
    return Math.min(1800, Math.max(750, 220 + textH + imgH + 200))
  },

  _drawFakeQR(ctx, x, y, size) {
    const cellSize = size / 27
    ctx.fillStyle = '#1A1A2E'
    for (let r = 0; r < 27; r++) {
      for (let c = 0; c < 27; c++) {
        if (r < 7 && c < 7) {
          if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            ctx.fillRect(x + c * cellSize, y + r * cellSize, cellSize - 0.5, cellSize - 0.5)
          }
        } else if (r < 7 && c > 20) {
          if (r === 0 || r === 6 || c === 20 || c === 26 || (r >= 2 && r <= 4 && c >= 22 && c <= 24)) {
            ctx.fillRect(x + c * cellSize, y + r * cellSize, cellSize - 0.5, cellSize - 0.5)
          }
        } else if (r > 20 && c < 7) {
          if (r === 20 || r === 26 || c === 0 || c === 6 || (r >= 22 && r <= 24 && c >= 2 && c <= 4)) {
            ctx.fillRect(x + c * cellSize, y + r * cellSize, cellSize - 0.5, cellSize - 0.5)
          }
        } else if ((r * 37 + c * 17) % 3 === 0) {
          ctx.fillRect(x + c * cellSize, y + r * cellSize, cellSize - 0.5, cellSize - 0.5)
        }
      }
    }
  },

  _roundRectPath(ctx, x, y, w, h, r) {
    if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r }
    ctx.beginPath()
    ctx.moveTo(x + r.tl, y); ctx.lineTo(x + w - r.tr, y); ctx.arcTo(x + w, y, x + w, y + r.tr, r.tr)
    ctx.lineTo(x + w, y + h - r.br); ctx.arcTo(x + w, y + h, x + w - r.br, y + h, r.br)
    ctx.lineTo(x + r.bl, y + h); ctx.arcTo(x, y + h, x, y + h - r.bl, r.bl)
    ctx.lineTo(x, y + r.tl); ctx.arcTo(x, y, x + r.tl, y, r.tl); ctx.closePath()
  },

  _wrapText(ctx, text, maxWidth, maxLines) {
    const lines = [], paragraphs = text.split('\n')
    for (const para of paragraphs) {
      if (maxLines && lines.length >= maxLines) break
      if (!para) { lines.push(''); continue }
      let current = ''
      for (let i = 0; i < para.length; i++) {
        const ch = para[i], test = current + ch
        if (ctx.measureText(test).width > maxWidth && current.length > 0) {
          lines.push(current); current = ch
          if (maxLines && lines.length >= maxLines) break
        } else { current = test }
      }
      if (current) lines.push(current)
    }
    return lines
  },

  // ==================== 分享菜单事件 ====================

  onCloseShareMenu() {
    this.setData({ showShareMenu: false })
  },

  onShareCardReady(e) {
    // share-menu 组件反馈
  },

  onRetryShareCard() {
    const item = this.data.item
    if (item && item.content) {
      this.setData({ shareGenerating: true, shareError: false, shareCardPath: '' })
      this._generateShareCard(item)
    }
  },

  onSaveShareCard() {
    if (!this.data.shareCardPath) return
    wx.saveImageToPhotosAlbum({
      filePath: this.data.shareCardPath,
      success: () => {
        wx.showToast({ title: '已保存到相册', icon: 'success' })
        this.setData({ showShareMenu: false })
      },
      fail: (err) => {
        if (err.errMsg && (err.errMsg.includes('auth deny') || err.errMsg.includes('deny'))) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存图片到相册',
            showCancel: false, confirmText: '去设置',
            success: (r) => { if (r.confirm) wx.openSetting() }
          })
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      }
    })
  },

  onCopyShareText() {
    const item = this.data.item
    const date = item.createdAt ? new Date(item.createdAt) : new Date()
    const ds = date.getFullYear() + '.' + String(date.getMonth() + 1).padStart(2, '0') + '.' + String(date.getDate()).padStart(2, '0')
    const tagStr = (item.tags && item.tags.length > 0) ? item.tags.map(t => '#' + t).join(' ') : ''
    const text = [item.content || '', item.supplement ? '\n' + item.supplement : '', '', tagStr ? tagStr + '\n' : '', '—— ' + ds + ' · 记灵感'].filter(s => s !== '').join('\n')
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '已复制', icon: 'success' }) })
  },

  // ==================== 原有功能 ====================

  onStartEdit() {
    this.setData({
      isEditing: true,
      editContent: this.data.item.content || '',
      editSupplement: this.data.item.supplement || ''
    })
  },

  onCancelEdit() {
    const item = this.data.item
    const changed = this.data.editContent !== (item.content || '') || this.data.editSupplement !== (item.supplement || '')
    if (changed) {
      wx.showModal({
        title: '放弃修改？', content: '修改内容将不会保存',
        success: (res) => {
          if (res.confirm) {
            this.setData({ isEditing: false, editContent: item.content || '', editSupplement: item.supplement || '' })
          }
        }
      })
    } else { this.setData({ isEditing: false }) }
  },

  onContentInput(e) { this.setData({ editContent: e.detail.value }) },
  onSupplementInput(e) { this.setData({ editSupplement: e.detail.value }) },

  onSaveEdit() {
    const content = this.data.editContent.trim()
    if (!content && this.data.imageList.length === 0) {
      wx.showToast({ title: '内容不能为空', icon: 'none' }); return
    }
    const updates = { content: content || this.data.item.content, supplement: this.data.editSupplement.trim() }
    const updated = storage.updateInspiration(this.data.localId, updates)
    if (updated) {
      this.setData({ item: updated, isEditing: false })
      wx.showToast({ title: '已保存', icon: 'success' })
      const pages = getCurrentPages()
      const prevPage = pages[pages.length - 2]
      if (prevPage && prevPage.onShow) prevPage.onShow()
    } else { wx.showToast({ title: '保存失败', icon: 'none' }) }
  },

  onDelete() {
    this.setData({ isDeleting: false })
    wx.showModal({
      title: '删除灵感', content: '删除后无法恢复，确定要删除吗？', confirmColor: '#FF3B30',
      success: (res) => {
        if (res.confirm) {
          storage.deleteInspiration(this.data.localId)
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        }
      }
    })
  },

  onCopy() {
    const item = this.data.item
    const text = [item.content || '', item.supplement || ''].filter(Boolean).join('\n')
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '已复制', icon: 'success' }) })
  },

  onToggleAbsorb() {
    const absorbed = !this.data.item.absorbed
    const updated = storage.updateInspiration(this.data.localId, { absorbed })
    if (updated) {
      this.setData({ item: updated, ['item.absorbed']: absorbed })
      wx.vibrateShort({ type: 'medium' })
      wx.showToast({ title: absorbed ? '已标记吸收' : '已取消吸收', icon: 'none' })
    }
  },

  onShowMore() {
    wx.showActionSheet({
      itemList: ['复制内容', '分享', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) this.onCopy()
        else if (res.tapIndex === 1) this.onShare()
        else if (res.tapIndex === 2) this.onDelete()
      }
    })
  },

  onPreviewImage(e) {
    const idx = e.currentTarget.dataset.index
    const images = this.data.imageList
    if (images.length === 0) return
    wx.previewImage({ current: images[idx] || images[0], urls: images })
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      // 页面栈异常（如被系统回收），回退到首页
      wx.reLaunch({ url: '/pages/index/index' })
    }
  },

  onShareAppMessage() {
    const item = this.data.item
    const shareData = {
      title: (item.content || '灵感').substring(0, 30),
      path: '/pages/detail/detail?localId=' + this.data.localId
    }
    if (this.data.shareCardPath) shareData.imageUrl = this.data.shareCardPath
    return shareData
  }
})
