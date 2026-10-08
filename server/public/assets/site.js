// Studex website. No frameworks, no trackers. Talks only to this site's /api.
;(() => {
  const $ = (sel) => document.querySelector(sel)
  const show = (el, on = true) => el && (el.hidden = !on)
  const peso = (minor) => `₱${(minor / 100).toLocaleString('en-PH', { minimumFractionDigits: minor % 100 ? 2 : 0 })}`

  async function api(path, body) {
    let res
    try {
      res = await fetch(`/api${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
    } catch {
      throw new Error("We couldn't reach Studex. Check your connection and try again.")
    }
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.ok === false) {
      const err = new Error(json.message || 'Something went wrong. Please try again in a few minutes.')
      err.code = json.code
      throw err
    }
    return json
  }

  function setError(el, message) {
    if (!el) return
    el.textContent = message || ''
    show(el, !!message)
  }

  function busy(button, on, label) {
    if (!button) return
    if (on) {
      button.dataset.label = button.textContent
      button.textContent = label
      button.disabled = true
    } else {
      button.textContent = button.dataset.label || button.textContent
      button.disabled = false
    }
  }

  function formatBytes(n) {
    return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`
  }

  // --- Product info: price and current Android release ------------------------------------------
  async function loadProduct() {
    if (!document.querySelector('[data-price], [data-release]')) return
    try {
      const { product, release } = await api('/product')
      document.querySelectorAll('[data-price]').forEach((el) => (el.textContent = peso(product.priceMinor)))
      document.querySelectorAll('[data-devices]').forEach((el) => (el.textContent = product.maxDevices === 1 ? 'one device at a time' : `${product.maxDevices} devices at a time`))
      if (release) {
        document.querySelectorAll('[data-release="version"]').forEach((el) => (el.textContent = release.version_name))
        document.querySelectorAll('[data-release="min"]').forEach((el) => (el.textContent = release.min_android))
        document.querySelectorAll('[data-release="size"]').forEach((el) => (el.textContent = formatBytes(release.size_bytes)))
        document.querySelectorAll('[data-release="sha256"]').forEach((el) => (el.textContent = release.sha256))
        document.querySelectorAll('[data-release="notes"]').forEach((el) => (el.textContent = release.notes || '—'))
        document.querySelectorAll('[data-release="date"]').forEach((el) => (el.textContent = new Date(release.published_at * 1000).toLocaleDateString('en-PH', { dateStyle: 'medium' })))
        show($('#release-facts'))
      }
    } catch {
      // Prices in the HTML are the fallback.
    }
  }

  // --- Checkout ---------------------------------------------------------------------------------
  function clientRef() {
    // Same id for repeated clicks in this tab, so a double click never opens two payments.
    try {
      let ref = sessionStorage.getItem('studex.checkoutRef')
      if (!ref) {
        ref = 'web_' + crypto.randomUUID().replace(/-/g, '')
        sessionStorage.setItem('studex.checkoutRef', ref)
      }
      return ref
    } catch {
      return 'web_' + crypto.randomUUID().replace(/-/g, '')
    }
  }

  const checkoutForm = $('#checkout-form')
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const email = $('#checkout-email').value.trim()
      const error = $('#checkout-error')
      const button = checkoutForm.querySelector('button')
      setError(error, '')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError(error, 'Enter a valid email address. Your license is sent there.')
      if (!$('#checkout-agree').checked) return setError(error, 'Please agree to the Terms and Refund Policy to continue.')
      busy(button, true, 'Opening secure checkout…')
      try {
        const { checkoutUrl } = await api('/checkout', { email, clientRef: clientRef() })
        if (!/^https:\/\/([a-z0-9-]+\.)*paymongo\.com\//.test(checkoutUrl)) throw new Error('Unexpected checkout address. Please contact support.')
        window.location.assign(checkoutUrl)
      } catch (err) {
        if (err.code === 'order_closed') {
          try { sessionStorage.removeItem('studex.checkoutRef') } catch {}
        }
        setError(error, err.message)
        busy(button, false)
      }
    })
  }

  // --- Success page: wait for PayMongo to confirm -----------------------------------------------
  const success = $('#order')
  if (success) {
    const token = new URLSearchParams(location.search).get('t')
    // Keep the token out of the address bar (and screenshots) once read; it stays in this tab.
    try {
      if (token) sessionStorage.setItem('studex.orderToken', token)
      history.replaceState(null, '', location.pathname)
    } catch {}
    const t = token || (() => { try { return sessionStorage.getItem('studex.orderToken') } catch { return null } })()
    try { sessionStorage.removeItem('studex.checkoutRef') } catch {}
    let tries = 0
    const states = ['pending', 'paid', 'problem', 'missing']
    const state = (name) => states.forEach((s) => show($(`#order-${s}`), s === name))

    async function poll() {
      if (!t) return state('missing')
      try {
        const order = await api(`/order?t=${encodeURIComponent(t)}`)
        if (order.status === 'paid') {
          state('paid')
          $('#order-email').textContent = order.email
          if (order.licenseCode) {
            $('#license-code').textContent = order.licenseCode
            show($('#license-block'))
          } else {
            show($('#license-emailed'))
          }
          if (order.downloadUrl) $('#download-link').href = order.downloadUrl
          return
        }
        if (['refunded', 'disputed', 'failed'].includes(order.status)) {
          $('#order-problem-text').textContent =
            order.status === 'failed' ? "We couldn't start this payment. You haven't been charged." : 'This order was refunded or is under review. Please contact support.'
          return state('problem')
        }
        state('pending')
      } catch (err) {
        if (err.code === 'order_not_found') return state('missing')
        state('pending')
      }
      tries += 1
      // About 10 minutes in total; QR Ph and bank payments can take a moment to confirm.
      if (tries < 120) setTimeout(poll, tries < 20 ? 3000 : 6000)
      else $('#order-slow').hidden = false
    }
    poll()

    const copy = $('#copy-code')
    copy?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('#license-code').textContent.trim())
        copy.textContent = 'Copied'
        setTimeout(() => (copy.textContent = 'Copy code'), 2000)
      } catch {
        copy.textContent = 'Select and copy the code above'
      }
    })
  }

  // --- Lost license code ------------------------------------------------------------------------
  const resendForm = $('#resend-form')
  if (resendForm) {
    resendForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const error = $('#resend-error')
      const button = resendForm.querySelector('button')
      setError(error, '')
      busy(button, true, 'Sending…')
      try {
        const res = await api('/license/resend', { email: $('#resend-email').value.trim() })
        $('#resend-done').textContent = `${res.message} The link works once, for 30 minutes.`
        show($('#resend-done'))
        show(resendForm, false)
      } catch (err) {
        setError(error, err.message)
      } finally {
        busy(button, false)
      }
    })
  }

  const reissue = $('#reissue')
  if (reissue) {
    const token = new URLSearchParams(location.hash.slice(1)).get('t')
    if (token) {
      history.replaceState(null, '', location.pathname)
      show($('#resend-section'), false)
      show(reissue)
      $('#reissue-button').addEventListener('click', async (e) => {
        const button = e.currentTarget
        busy(button, true, 'Creating your new code…')
        setError($('#reissue-error'), '')
        try {
          const res = await api('/license/reissue', { token })
          $('#new-code').textContent = res.licenseCode
          $('#reissue-download').href = res.downloadUrl
          show($('#reissue-start'), false)
          show($('#reissue-done'))
        } catch (err) {
          setError($('#reissue-error'), err.message)
          busy(button, false)
        }
      })
    }
  }

  loadProduct()
  document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = String(new Date().getFullYear())))
})()
