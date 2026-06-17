// components/project-card/index.js
Component({
  properties: {
    project: {
      type: Object,
      value: {}
    }
  },

  data: {
    displayTime: ''
  },

  lifetimes: {
    attached() {
      this.updateDisplayTime()
    }
  },

  observers: {
    'project.lastActivityAt': function() {
      this.updateDisplayTime()
    }
  },

  methods: {
    updateDisplayTime() {
      const t = this.data.project.lastActivityAt
      if (!t) return
      const d = new Date(t)
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

    onTap() {
      this.triggerEvent('select', { project: this.data.project })
    },

    onLongPress() {
      // 防重复触发
      if (this._longPressFired) return
      this._longPressFired = true
      setTimeout(() => { this._longPressFired = false }, 500)

      wx.vibrateShort({ type: 'medium' })
      this.triggerEvent('longpress', { project: this.data.project })
    }
  }
})
