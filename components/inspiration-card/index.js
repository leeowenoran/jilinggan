// components/inspiration-card/index.js
Component({
  properties: {
    item: {
      type: Object,
      value: {}
    },
    selectMode: {
      type: Boolean,
      value: false
    },
    selected: {
      type: Boolean,
      value: false
    }
  },

  data: {
    displayTime: '',
    slideOpen: false,        // 左滑删除
    absorbSlideOpen: false   // 右滑吸收
  },

  lifetimes: {
    attached() {
      this.updateDisplayTime()
    }
  },

  observers: {
    'item.createdAt': function() {
      this.updateDisplayTime()
    }
  },

  methods: {
    updateDisplayTime() {
      const createdAt = this.data.item.createdAt
      if (!createdAt) return
      const d = new Date(createdAt)
      const now = new Date()
      const diff = now - d
      const mins = Math.floor(diff / 60000)
      const hours = Math.floor(diff / 3600000)
      const days = Math.floor(diff / 86400000)

      let displayTime = ''
      if (mins < 1) displayTime = '刚刚'
      else if (mins < 60) displayTime = mins + '分钟前'
      else if (hours < 24) displayTime = hours + '小时前'
      else if (days < 7) displayTime = days + '天前'
      else displayTime = d.getFullYear() + '/' + (d.getMonth()+1) + '/' + d.getDate()

      this.setData({ displayTime })
    },

    // ============ 滑动手势 ============
    // 左滑 → 删除；右滑 → 吸收

    onTouchStart(e) {
      this._touchStartX = e.touches[0].clientX
      this._touchStartY = e.touches[0].clientY
      this._slideTriggered = false
    },

    onTouchMove(e) {
      if (this._slideTriggered) return

      const currentX = e.touches[0].clientX
      const currentY = e.touches[0].clientY
      const deltaX = currentX - this._touchStartX
      const deltaY = currentY - this._touchStartY

      // 垂直滑动为主 → 让页面滚动，不处理
      if (Math.abs(deltaY) > Math.abs(deltaX)) return

      const threshold = 40

      // 删除区已打开 → 右滑关闭
      if (this.data.slideOpen && deltaX > threshold) {
        this._slideTriggered = true
        this.setData({ slideOpen: false })
        return
      }
      // 吸收区已打开 → 左滑关闭
      if (this.data.absorbSlideOpen && deltaX < -threshold) {
        this._slideTriggered = true
        this.setData({ absorbSlideOpen: false })
        return
      }
      // 初始态：左滑 → 打开删除区
      if (!this.data.slideOpen && !this.data.absorbSlideOpen && deltaX < -threshold) {
        this._slideTriggered = true
        this.setData({ slideOpen: true, absorbSlideOpen: false })
        wx.vibrateShort({ type: 'light' })
        return
      }
      // 初始态：右滑 → 打开吸收区
      if (!this.data.slideOpen && !this.data.absorbSlideOpen && deltaX > threshold) {
        this._slideTriggered = true
        this.setData({ absorbSlideOpen: true, slideOpen: false })
        wx.vibrateShort({ type: 'light' })
        return
      }
    },

    onTouchEnd() {
      this._slideTriggered = false
    },

    // ============ 吸收操作 ============
    onMarkAbsorbed() {
      const absorbed = !this.data.item.absorbed
      wx.vibrateShort({ type: 'medium' })
      this.setData({ absorbSlideOpen: false })
      this.triggerEvent('absorb', {
        item: this.data.item,
        absorbed: absorbed
      })
    },

    // ============ 删除操作 ============
    onDelete() {
      wx.vibrateShort({ type: 'heavy' })
      this.triggerEvent('delete', { item: this.data.item })
    },

    // ============ 点击 ============
    onTap() {
      if (this.data.slideOpen) {
        this.setData({ slideOpen: false })
        return
      }
      if (this.data.absorbSlideOpen) {
        this.setData({ absorbSlideOpen: false })
        return
      }
      if (this.properties.selectMode) {
        this.triggerEvent('select', { item: this.data.item })
        return
      }
      this.triggerEvent('tap', { item: this.data.item })
    },

    onLongPress() {
      if (this.data.slideOpen || this.data.absorbSlideOpen || this.properties.selectMode) return
      // 防重复触发（微信 bindlongpress 已知问题）
      if (this._actionSheetOpen) return
      this._actionSheetOpen = true
      wx.vibrateShort({ type: 'medium' })
      const item = this.properties.item
      wx.showActionSheet({
        itemList: ['复制内容', '分享灵感卡', '删除'],
        success: (res) => {
          if (res.tapIndex === 0) {
            // 复制
            const content = [item.content || '', item.supplement || ''].filter(Boolean).join('\n')
            wx.setClipboardData({
              data: content,
              success: () => {
                wx.showToast({ title: '已复制', icon: 'success', duration: 1000 })
              }
            })
          } else if (res.tapIndex === 1) {
            // 分享
            this.triggerEvent('share', { item: item })
          } else if (res.tapIndex === 2) {
            // 删除
            this.triggerEvent('delete', { item: item })
          }
        },
        complete: () => {
          this._actionSheetOpen = false
        }
      })
    },

    // ============ 图片预览 ============
    onPreviewImage(e) {
      const idx = e.currentTarget.dataset.index
      const images = this.data.item.images || []
      if (images.length === 0) return
      wx.previewImage({
        current: images[idx] || images[0],
        urls: images
      })
    }
  }
})
