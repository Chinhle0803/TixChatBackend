// Singleton pattern to avoid circular imports
let ioInstance = null

export const setIO = (io) => {
  ioInstance = io
}

export const getIO = () => {
  return ioInstance
}
