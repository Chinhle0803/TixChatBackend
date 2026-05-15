const DEFAULT_PROVINCE = 'Thành phố Hồ Chí Minh'

const DIRECT_CONTROLLED_CITIES = {
  'ho chi minh': 'Thành phố Hồ Chí Minh',
  'sai gon': 'Thành phố Hồ Chí Minh',
  hcm: 'Thành phố Hồ Chí Minh',
  tphcm: 'Thành phố Hồ Chí Minh',
  'tp hcm': 'Thành phố Hồ Chí Minh',
  'ha noi': 'Thành phố Hà Nội',
  hanoi: 'Thành phố Hà Nội',
  'hai phong': 'Thành phố Hải Phòng',
  'da nang': 'Thành phố Đà Nẵng',
  'can tho': 'Thành phố Cần Thơ',
  hue: 'Thành phố Huế',
}

const resolveDirectControlledCity = (comparable = '') => {
  if (!comparable) return ''
  if (comparable.includes('ho chi minh') || comparable.includes('sai gon') || comparable === 'hcm' || comparable === 'tphcm' || comparable === 'tp hcm') {
    return DIRECT_CONTROLLED_CITIES['ho chi minh']
  }
  if (comparable.includes('ha noi') || comparable.includes('hanoi')) {
    return DIRECT_CONTROLLED_CITIES['ha noi']
  }
  if (comparable.includes('hai phong')) {
    return DIRECT_CONTROLLED_CITIES['hai phong']
  }
  if (comparable.includes('da nang')) {
    return DIRECT_CONTROLLED_CITIES['da nang']
  }
  if (comparable.includes('can tho')) {
    return DIRECT_CONTROLLED_CITIES['can tho']
  }
  if (comparable.includes('hue')) {
    return DIRECT_CONTROLLED_CITIES.hue
  }
  return ''
}

const DIRECT_CONTROLLED_CITY_CODES = {
  'VN-SG': 'Thành phố Hồ Chí Minh',
  'VN-HN': 'Thành phố Hà Nội',
  'VN-HP': 'Thành phố Hải Phòng',
  'VN-DN': 'Thành phố Đà Nẵng',
  'VN-CT': 'Thành phố Cần Thơ',
  'VN-TTH': 'Thành phố Huế',
}

const GENERIC_ADDRESS_LABELS = new Set([
  'vi tri da chon tren ban do',
  'vi tri da chon',
  'vi tri hien tai',
])

const toComparable = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase()
  .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const cleanSegment = (value = '') => String(value || '').replace(/\s+/g, ' ').trim().replace(/^,+|,+$/g, '')

const splitAddressSegments = (value = '') =>
  String(value || '')
    .split(',')
    .map((segment) => cleanSegment(segment))
    .filter(Boolean)

const toDisplayCase = (value = '') => cleanSegment(value)
  .split(' ')
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
  .join(' ')

const stripLeadingLabel = (value = '', patterns = []) => {
  let next = cleanSegment(value)
  patterns.forEach((pattern) => {
    next = next.replace(pattern, '').trim()
  })
  return cleanSegment(next)
}

const stripRepeatedLeadingLabels = (value = '', patterns = []) => {
  let next = cleanSegment(value)
  let changed = true

  while (changed) {
    changed = false
    patterns.forEach((pattern) => {
      const replaced = cleanSegment(next.replace(pattern, ''))
      if (replaced !== next) {
        next = replaced
        changed = true
      }
    })
  }

  return cleanSegment(next)
}

const administrativeBase = (value = '') =>
  toComparable(
    stripRepeatedLeadingLabels(value, [
      /^tp\.?\s*/i,
      /^thanh pho\s+/i,
      /^city\s+/i,
      /^tinh\s+/i,
      /^q\.?\s*/i,
      /^quan\s+/i,
      /^huyen\s+/i,
      /^thi xa\s+/i,
      /^ph(?:ường|uong)\s+/i,
      /^xa\s+/i,
      /^thi tran\s+/i,
      /^ward\s+/i,
      /^district\s+/i,
      /^county\s+/i,
      /^thon\s+/i,
      /^xom\s+/i,
      /^ap\s+/i,
      /^ban\s+/i,
      /^to dan pho\s+/i,
      /^khu pho\s+/i,
    ])
  )

const uniqueSegments = (segments = []) => {
  const seen = new Set()
  const results = []

  segments.forEach((segment) => {
    const cleaned = cleanSegment(segment)
    if (!cleaned) return
    const comparable = toComparable(cleaned)
    if (!comparable || seen.has(comparable)) return
    seen.add(comparable)
    results.push(cleaned)
  })

  return results
}

const isMeaningfulAddress = (value = '') => {
  const comparable = toComparable(value)
  return Boolean(comparable && !GENERIC_ADDRESS_LABELS.has(comparable))
}

const isCountrySegment = (value = '') => {
  const comparable = toComparable(value)
  return comparable === 'viet nam' || comparable === 'vietnam'
}

const isWardLikeSegment = (value = '') => {
  const comparable = toComparable(value)
  return (
    comparable.startsWith('phuong ') ||
    comparable.startsWith('xa ') ||
    comparable.startsWith('thi tran ') ||
    comparable.startsWith('ward ') ||
    comparable.startsWith('commune ') ||
    comparable.startsWith('township ')
  )
}

const isDistrictLikeSegment = (value = '') => {
  const comparable = toComparable(value)
  return (
    comparable.startsWith('quan ') ||
    /^q\.?\s*\d{1,2}$/.test(comparable) ||
    comparable.startsWith('huyen ') ||
    comparable.startsWith('thi xa ') ||
    comparable.startsWith('thanh pho ') ||
    comparable.startsWith('district ') ||
    comparable.endsWith(' district') ||
    comparable.startsWith('county ') ||
    comparable.endsWith(' county')
  )
}

const isProvinceLikeSegment = (value = '') => {
  const comparable = toComparable(value)
  return (
    Boolean(DIRECT_CONTROLLED_CITIES[comparable]) ||
    comparable.startsWith('tinh ') ||
    comparable.startsWith('thanh pho ') ||
    comparable.startsWith('tp ') ||
    comparable.startsWith('city ') ||
    comparable.endsWith(' city')
  )
}

const isLocalityLikeSegment = (value = '') => {
  const comparable = toComparable(value)
  return (
    comparable.startsWith('thon ') ||
    comparable.startsWith('xom ') ||
    comparable.startsWith('ap ') ||
    comparable.startsWith('ban ') ||
    comparable.startsWith('to dan pho ') ||
    comparable.startsWith('khu pho ')
  )
}

const canonicalizeProvince = (value = '', isoCode = '') => {
  const isoNormalized = String(isoCode || '').trim().toUpperCase()
  if (DIRECT_CONTROLLED_CITY_CODES[isoNormalized]) {
    return DIRECT_CONTROLLED_CITY_CODES[isoNormalized]
  }

  const raw = cleanSegment(value)
  if (!raw) return ''

  const comparable = toComparable(raw)
  if (!comparable) return ''

  const directControlledCity = resolveDirectControlledCity(comparable)
  if (directControlledCity) {
    return directControlledCity
  }

  if (comparable.startsWith('thanh pho ') || comparable.startsWith('tp ') || comparable.startsWith('city ') || comparable.endsWith(' city')) {
    const nextValue = comparable.endsWith(' city')
      ? cleanSegment(raw.replace(/\s+city$/i, ''))
      : stripRepeatedLeadingLabels(raw, [/^tp\.?\s*/i, /^thanh pho\s+/i, /^city\s+/i])
    const nestedComparable = toComparable(nextValue)
    const nestedDirectControlledCity = resolveDirectControlledCity(nestedComparable)
    if (nestedDirectControlledCity) {
      return nestedDirectControlledCity
    }
    return `Thành phố ${toDisplayCase(nextValue)}`
  }

  const withoutLabel = comparable.startsWith('tinh ')
    ? stripRepeatedLeadingLabels(raw, [/^tinh\s+/i])
    : raw

  return `Tỉnh ${toDisplayCase(withoutLabel)}`
}

const canonicalizeDistrict = (value = '') => {
  const raw = cleanSegment(value)
  if (!raw) return ''

  const comparable = toComparable(raw)
  if (!comparable) return ''

  const districtNumber = comparable.match(/^(q|quan)\s*(\d{1,2})$/)
  if (districtNumber) return `Quận ${districtNumber[2]}`

  if (comparable.startsWith('district ')) {
    return `Quận ${toDisplayCase(stripLeadingLabel(raw, [/^district\s+/i]))}`
  }
  if (comparable.endsWith(' district')) {
    return `Quận ${toDisplayCase(raw.replace(/\s+district$/i, ''))}`
  }
  if (comparable.startsWith('county ')) {
    return `Huyện ${toDisplayCase(stripLeadingLabel(raw, [/^county\s+/i]))}`
  }
  if (comparable.endsWith(' county')) {
    return `Huyện ${toDisplayCase(raw.replace(/\s+county$/i, ''))}`
  }
  if (comparable.startsWith('quan ')) {
    return `Quận ${toDisplayCase(stripLeadingLabel(raw, [/^quan\s+/i]))}`
  }
  if (comparable.startsWith('huyen ')) {
    return `Huyện ${toDisplayCase(stripLeadingLabel(raw, [/^huyen\s+/i]))}`
  }
  if (comparable.startsWith('thi xa ')) {
    return `Thị xã ${toDisplayCase(stripLeadingLabel(raw, [/^thi xa\s+/i]))}`
  }
  if (comparable.startsWith('thanh pho ')) {
    return `Thành phố ${toDisplayCase(stripLeadingLabel(raw, [/^thanh pho\s+/i]))}`
  }

  return toDisplayCase(raw)
}

const canonicalizeWard = (value = '') => {
  const raw = cleanSegment(value)
  if (!raw) return ''

  const comparable = toComparable(raw)
  if (!comparable) return ''

  if (comparable.startsWith('ward ')) {
    return `Phường ${toDisplayCase(stripLeadingLabel(raw, [/^ward\s+/i]))}`
  }
  if (comparable.startsWith('commune ')) {
    return `Xã ${toDisplayCase(stripLeadingLabel(raw, [/^commune\s+/i]))}`
  }
  if (comparable.startsWith('township ')) {
    return `Thị trấn ${toDisplayCase(stripLeadingLabel(raw, [/^township\s+/i]))}`
  }
  if (comparable.startsWith('phuong ')) {
    return `Phường ${toDisplayCase(raw.replace(/^ph(?:ường|uong)\s+/i, '').trim())}`
  }
  if (comparable.startsWith('xa ')) {
    return `Xã ${toDisplayCase(stripLeadingLabel(raw, [/^xa\s+/i]))}`
  }
  if (comparable.startsWith('thi tran ')) {
    return `Thị trấn ${toDisplayCase(stripLeadingLabel(raw, [/^thi tran\s+/i]))}`
  }

  return toDisplayCase(raw)
}

const canonicalizeLocality = (value = '') => {
  const raw = cleanSegment(value)
  if (!raw) return ''

  const comparable = toComparable(raw)
  if (!comparable) return ''

  const mappings = [
    [/^thon\s+/i, 'Thôn'],
    [/^xom\s+/i, 'Xóm'],
    [/^ap\s+/i, 'Ấp'],
    [/^ban\s+/i, 'Bản'],
    [/^to dan pho\s+/i, 'Tổ dân phố'],
    [/^khu pho\s+/i, 'Khu phố'],
  ]

  for (const [pattern, label] of mappings) {
    if (pattern.test(raw)) {
      return `${label} ${toDisplayCase(stripLeadingLabel(raw, [pattern]))}`
    }
  }

  return toDisplayCase(raw)
}

const extractStructuredAddress = (address = '') => {
  const segments = splitAddressSegments(address)
  const leadSegments = []
  let locality = ''
  let ward = ''
  let district = ''
  let province = ''

  segments.forEach((segment) => {
    if (isCountrySegment(segment)) return
    if (!province && isProvinceLikeSegment(segment)) {
      province = canonicalizeProvince(segment)
      return
    }
    if (!district && isDistrictLikeSegment(segment)) {
      district = canonicalizeDistrict(segment)
      return
    }
    if (!ward && isWardLikeSegment(segment)) {
      ward = canonicalizeWard(segment)
      return
    }
    if (!locality && isLocalityLikeSegment(segment)) {
      locality = canonicalizeLocality(segment)
      return
    }

    leadSegments.push(cleanSegment(segment))
  })

  return {
    leadSegments: uniqueSegments(leadSegments),
    locality,
    ward,
    district,
    province,
  }
}

const formatVietnameseAddressFromParts = ({
  leadSegments = [],
  locality = '',
  ward = '',
  district = '',
  province = '',
} = {}) => {
  const normalizedLocality = canonicalizeLocality(locality)
  const normalizedWard = canonicalizeWard(ward)
  let normalizedDistrict = canonicalizeDistrict(district)
  const normalizedProvince = canonicalizeProvince(province)

  if (administrativeBase(normalizedDistrict) && administrativeBase(normalizedDistrict) === administrativeBase(normalizedWard)) {
    normalizedDistrict = ''
  }
  if (administrativeBase(normalizedLocality) && administrativeBase(normalizedLocality) === administrativeBase(normalizedWard)) {
    locality = ''
  }
  const safeLocality = locality ? normalizedLocality : ''

  const segments = uniqueSegments([
    ...leadSegments,
    safeLocality,
    normalizedWard,
    normalizedDistrict,
    normalizedProvince,
  ])

  return segments.join(', ')
}

export const formatVietnameseAddress = (location = {}) => {
  const address = cleanSegment(location?.address || '')
  const structured = extractStructuredAddress(address)
  const district = canonicalizeDistrict(location?.district || structured.district || location?.fallbackDistrict || '')
  const province = canonicalizeProvince(location?.province || structured.province || location?.fallbackProvince || '')

  return formatVietnameseAddressFromParts({
    leadSegments: structured.leadSegments,
    locality: structured.locality,
    ward: structured.ward,
    district,
    province,
  })
}

export const buildVietnameseAddressFromGeocode = (addressObject = {}, coordinates = {}) => {
  const houseNumber = cleanSegment(addressObject?.house_number || '')
  const road = cleanSegment(
    addressObject?.road ||
    addressObject?.pedestrian ||
    addressObject?.street ||
    addressObject?.footway ||
    addressObject?.cycleway ||
    ''
  )

  const streetLine = cleanSegment([houseNumber, road].filter(Boolean).join(' '))
  const locality = canonicalizeLocality(
    addressObject?.hamlet ||
    addressObject?.village ||
    addressObject?.quarter ||
    addressObject?.neighbourhood ||
    addressObject?.residential ||
    addressObject?.allotments ||
    addressObject?.city_block ||
    ''
  )

  const ward = canonicalizeWard(
    addressObject?.ward ||
    addressObject?.suburb ||
    ''
  )

  const district = canonicalizeDistrict(
    addressObject?.city_district ||
    addressObject?.district ||
    addressObject?.county ||
    addressObject?.borough ||
    ''
  )

  const province = canonicalizeProvince(
    addressObject?.state ||
    addressObject?.province ||
    addressObject?.region ||
    addressObject?.city ||
    '',
    addressObject?.['ISO3166-2-lvl4'] || ''
  )

  const address = formatVietnameseAddressFromParts({
    leadSegments: streetLine ? [streetLine] : [],
    locality,
    ward,
    district,
    province,
  })

  return {
    address: address || `Vị trí đã chọn (${Number(coordinates?.lat || 0).toFixed(5)}, ${Number(coordinates?.lng || 0).toFixed(5)})`,
    province,
    district,
  }
}

export const normalizeRegionContext = ({ province = '', district = '', fallbackProvince = '' } = {}) => ({
  province: canonicalizeProvince(province || fallbackProvince || ''),
  district: canonicalizeDistrict(district || ''),
})

export const normalizePostLocation = (location = {}) => {
  if (!location || typeof location !== 'object') return null

  const publicLocation = { ...location }
  delete publicLocation.fallbackProvince
  delete publicLocation.fallbackDistrict

  const formattedAddress = formatVietnameseAddress(location)
  const province = canonicalizeProvince(location.province || location.fallbackProvince || '')
  const district = canonicalizeDistrict(location.district || location.fallbackDistrict || '')

  return {
    ...publicLocation,
    address: formattedAddress,
    province,
    district,
  }
}

export const rankPostByRegion = (post, context = {}) => {
  const postProvince = canonicalizeProvince(post?.location?.province || '')
  const postDistrict = canonicalizeDistrict(post?.location?.district || '')
  const userProvince = canonicalizeProvince(context?.province || '')
  const userDistrict = canonicalizeDistrict(context?.district || '')

  if (userDistrict && userProvince && postDistrict === userDistrict && postProvince === userProvince) {
    return 0
  }
  if (userProvince && postProvince === userProvince) {
    return 1
  }
  return 2
}

export const comparePostsByRegion = (a, b, context = {}) => {
  const rankA = rankPostByRegion(a, context)
  const rankB = rankPostByRegion(b, context)
  if (rankA !== rankB) return rankA - rankB

  const createdAtA = Date.parse(a?.createdAt || '')
  const createdAtB = Date.parse(b?.createdAt || '')
  const hasCreatedAtA = Number.isFinite(createdAtA)
  const hasCreatedAtB = Number.isFinite(createdAtB)

  if (hasCreatedAtA && hasCreatedAtB && createdAtA !== createdAtB) {
    return createdAtB - createdAtA
  }
  if (hasCreatedAtA !== hasCreatedAtB) {
    return hasCreatedAtB ? 1 : -1
  }

  return String(b?.createdAt || '').localeCompare(String(a?.createdAt || ''))
}

export {
  DEFAULT_PROVINCE,
  canonicalizeDistrict,
  canonicalizeProvince,
  canonicalizeWard,
  isMeaningfulAddress,
}
