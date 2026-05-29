/**
 * 通用表单收集 — 所有页面共用
 *
 * 一次性配置：把 Google Apps Script 部署后的 URL 填到 COLLECTOR_URL
 * 部署方法见同目录 collector/google-apps-script.txt
 */
const FormCollector = (function () {
  const COLLECTOR_URL = 'https://script.google.com/macros/s/AKfycbzxc3dgL0aT2aVddLYM7PtQerpoAmHWzsKCNdFEkd4wWJ-baeA0s8N2quy3BmLaqfyX/exec';
  const IDENTITY_KEY = 'shanghai-guide-identity';
  const IDENTITY_FIELDS = ['name'];

  function loadIdentity() {
    try {
      return JSON.parse(localStorage.getItem(IDENTITY_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveIdentity(fields) {
    const identity = loadIdentity();
    IDENTITY_FIELDS.forEach((key) => {
      if (fields[key]) identity[key] = fields[key];
    });
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    return identity;
  }

  function attachIdentity(fields) {
    const identity = saveIdentity(fields);
    const merged = { ...fields };
    if (identity.name) merged.respondent_name = identity.name;
    return merged;
  }

  function prefillIdentity(form) {
    const identity = loadIdentity();
    IDENTITY_FIELDS.forEach((key) => {
      const el = form.querySelector(`[name="${key}"]`);
      if (el && identity[key] && !el.value) el.value = identity[key];
    });
  }

  function normalizeFields(data) {
    if (data.availability != null && !Array.isArray(data.availability)) {
      data.availability = [data.availability];
    }
    return data;
  }

  function serializeForm(form) {
    const data = {};
    const elements = form.querySelectorAll('input, select, textarea');

    elements.forEach((el) => {
      if (!el.name || el.name.startsWith('_')) return;
      if (el.type === 'checkbox') {
        if (!el.checked) return;
        if (data[el.name]) {
          if (!Array.isArray(data[el.name])) data[el.name] = [data[el.name]];
          data[el.name].push(el.value);
        } else {
          data[el.name] = el.value;
        }
        return;
      }
      if (el.type === 'radio') {
        if (!el.checked) return;
        data[el.name] = el.value;
        return;
      }
      if (el.type === 'file') return;
      const val = el.value.trim();
      if (val) data[el.name] = val;
    });

    return normalizeFields(data);
  }

  function validate(form, rules = {}) {
    if (rules.requireCheckboxGroup) {
      rules.requireCheckboxGroup.forEach((name) => {
        const checked = form.querySelectorAll(`input[name="${name}"]:checked`);
        if (checked.length === 0) {
          throw new Error(rules.messages?.[name] || 'Please complete the required fields.');
        }
      });
    }
    if (rules.requireRadio) {
      rules.requireRadio.forEach((name) => {
        const selected = form.querySelector(`input[name="${name}"]:checked`);
        if (!selected) {
          throw new Error(rules.messages?.[name] || 'Please complete the required fields.');
        }
      });
    }
  }

  async function submit(form, options = {}) {
    validate(form, options.validate || {});

    const payload = {
      formId: options.formId || form.dataset.formId || 'unnamed',
      pageTitle: document.title,
      page: location.pathname.split('/').pop() || 'index.html',
      submittedAt: new Date().toISOString(),
      fields: attachIdentity(serializeForm(form)),
    };

    if (!COLLECTOR_URL) {
      console.error('[FormCollector] COLLECTOR_URL is not set. See collector/google-apps-script.txt');
      throw new Error('COLLECTOR_NOT_READY');
    }

    const res = await fetch(COLLECTOR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('NETWORK');

    const result = await res.json();
    if (!result.success) throw new Error('SERVER');
    return result;
  }

  function bind(form, options = {}) {
    prefillIdentity(form);
    const errorEl = options.errorEl;
    const successEl = options.successEl;
    const submitBtn = options.submitBtn || form.querySelector('[type="submit"]');
    const btnDefaultText = submitBtn?.textContent || 'Submit';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.remove('is-visible');
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = options.sendingText || 'Sending…';
      }

      try {
        await submit(form, options);
        if (options.hideFormOnSuccess !== false) {
          form.hidden = true;
        }
        if (successEl) {
          successEl.classList.add('is-visible');
          successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        options.onSuccess?.();
      } catch (err) {
        const msg =
          err.message === 'COLLECTOR_NOT_READY'
            ? 'Submission is temporarily unavailable. Please contact lianye.'
            : err.message?.includes('Please')
              ? err.message
              : options.errorMessage || 'Something went wrong. Please try again.';
        if (errorEl) {
          errorEl.textContent = msg;
          errorEl.classList.add('is-visible');
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = btnDefaultText;
        }
      }
    });
  }

  return { bind, submit, serializeForm, loadIdentity, prefillIdentity };
})();
