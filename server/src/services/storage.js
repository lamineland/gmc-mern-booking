import { Image } from '../models/Image.js';

// Single entry point for file storage. Images are kept in MongoDB for now; to move to
// Cloudinary or S3 later, change only this module.
export const storage = {
  async save({ buffer, contentType, ownerId }) {
    const image = await Image.create({ ownerId, contentType, size: buffer.length, data: buffer });
    return image._id;
  },

  async get(id) {
    return Image.findById(id);
  },

  async remove(id) {
    await Image.deleteOne({ _id: id });
  },

  async removeMany(ids) {
    if (ids?.length) await Image.deleteMany({ _id: { $in: ids } });
  },
};
