const SYNONYM_GROUPS = {
  traffic: ['ket xe', 'un tac', 'dong xe', 'giao thong'],
  flood: ['ngap', 'lut', 'nuoc dang'],
  electricity: ['mat dien', 'dien chập chon', 'dien'],
  waste: ['rac', 'mui hoi', 'diem tap ket rac'],
}

const normalizeForMatch = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[.,/?#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

class SynonymNormalizer {
  expand(query = '') {
    const normalized = normalizeForMatch(query)
    const terms = new Set(normalized.split(/\s+/).filter(Boolean))

    Object.values(SYNONYM_GROUPS).forEach((group) => {
      const hasMatch = group.some((term) => normalized.includes(term))
      if (!hasMatch) return
      group.forEach((term) => terms.add(term))
    })

    return [...terms]
  }
}

export default new SynonymNormalizer()
