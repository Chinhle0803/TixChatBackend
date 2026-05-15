import postService from '../services/PostService.js'

class PostController {
  async listPosts(req, res) {
    try {
      const result = await postService.listPosts(req.query)
      return res.json(result)
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to list posts' })
    }
  }

  async createPost(req, res) {
    try {
      const post = await postService.createPost(req.userId, req.body)
      return res.status(201).json({ post })
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to create post' })
    }
  }

  async getPost(req, res) {
    try {
      const post = await postService.getPost(req.params.postId)
      return res.json({ post })
    } catch (error) {
      return res.status(error.message === 'Post not found' ? 404 : 400).json({ error: error.message || 'Failed to get post' })
    }
  }

  async updateStatus(req, res) {
    try {
      const post = await postService.updateStatus(req.params.postId, req.userId, req.body?.status)
      return res.json({ post })
    } catch (error) {
      const status = error.message?.includes('Only the author') ? 403 : 400
      return res.status(status).json({ error: error.message || 'Failed to update status' })
    }
  }

  async addReaction(req, res) {
    try {
      const post = await postService.addReaction(req.params.postId, req.userId, req.body?.reactionType)
      return res.json({ post })
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to add reaction' })
    }
  }

  async removeReaction(req, res) {
    try {
      const post = await postService.removeReaction(req.params.postId, req.userId, req.params.reactionType)
      return res.json({ post })
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to remove reaction' })
    }
  }

  async listComments(req, res) {
    try {
      const result = await postService.listComments(req.params.postId, req.query)
      return res.json(result)
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to list comments' })
    }
  }

  async createComment(req, res) {
    try {
      const result = await postService.createComment(req.params.postId, req.userId, req.body)
      return res.status(201).json(result)
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to create comment' })
    }
  }

  async addCommentReaction(req, res) {
    try {
      const result = await postService.addCommentReaction(
        req.params.postId,
        req.params.commentId,
        req.userId,
        req.body?.reactionType
      )
      return res.json(result)
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to add comment reaction' })
    }
  }

  async removeCommentReaction(req, res) {
    try {
      const result = await postService.removeCommentReaction(
        req.params.postId,
        req.params.commentId,
        req.userId,
        req.params.reactionType
      )
      return res.json(result)
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to remove comment reaction' })
    }
  }

  async createUploadUrl(req, res) {
    try {
      const result = await postService.createUploadUrl(req.userId, req.body)
      return res.json(result)
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to create upload URL' })
    }
  }

  async uploadImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image uploaded' })
      }
      const result = await postService.uploadImage(req.userId, req.file)
      return res.status(201).json(result)
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to upload post image' })
    }
  }

  async nearby(req, res) {
    try {
      const result = await postService.nearby(req.query)
      return res.json(result)
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to list nearby posts' })
    }
  }

  async inBounds(req, res) {
    try {
      const result = await postService.inBounds(req.query)
      return res.json(result)
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to list posts in bounds' })
    }
  }
}

export default new PostController()
