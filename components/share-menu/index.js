// components/share-menu/index.js
// 纯展示组件，不再负责 Canvas 生成（已移至 detail 页面）
Component({
  properties: {
    cardImagePath: {
      type: String,
      value: ''
    },
    isGenerating: {
      type: Boolean,
      value: true
    },
    generateError: {
      type: Boolean,
      value: false
    }
  },

  data: {},

  methods: {
    onRetry() {
      this.triggerEvent('retry')
    },
    onSave() {
      this.triggerEvent('save')
    },
    onCopyText() {
      this.triggerEvent('copytext')
    },
    onClose() {
      this.triggerEvent('close')
    },
    onStopPropagation() {}
  }
})
