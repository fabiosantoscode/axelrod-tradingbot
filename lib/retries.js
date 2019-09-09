
const retries = async (fn, count = 3) => {
  try {
    return await fn()
  } catch (e) {
    if (count > 0) {
      return retries(fn, count - 1)
    }
    throw e
  }
}

module.exports = retries
