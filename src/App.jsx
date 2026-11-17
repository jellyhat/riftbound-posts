import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import './App.css'

const fetchPosts = (sort) =>
  supabase
    .from('posts')
    .select('*')
    .order(sort, { ascending: false, nullsFirst: false })

const formatDate = (date) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(date),
  )

function App() {
  const [posts, setPosts] = useState([])
  const [sort, setSort] = useState('created_at')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [composer, setComposer] = useState(null)

  const loadPosts = useCallback(async () => {
    const { data, error: fetchError } = await fetchPosts(sort)

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setPosts(data ?? [])
    }
    setLoading(false)
  }, [sort])

  useEffect(() => {
    let active = true
    fetchPosts(sort)
      .then(({ data, error: fetchError }) => {
        if (!active) return
        if (fetchError) setError(fetchError.message)
        else setPosts(data ?? [])
        setLoading(false)
      })
    return () => { active = false }
  }, [sort])

  const handleVote = async (post) => {
    const currentVotes = post.upvotes ?? 0
    setPosts((items) =>
      items.map((item) => (item.id === post.id ? { ...item, upvotes: currentVotes + 1 } : item)),
    )
    const { error: voteError } = await supabase
      .from('posts')
      .update({ upvotes: currentVotes + 1 })
      .eq('id', post.id)
    if (voteError) {
      setPosts((items) =>
        items.map((item) => (item.id === post.id ? { ...item, upvotes: currentVotes } : item)),
      )
      setError(voteError.message)
      return false
    }
    return true
  }

  const savePost = async (values, editingPost) => {
    setError('')
    const result = editingPost
      ? await supabase
          .from('posts')
          .update({ ...values, updated_at: new Date().toISOString() })
          .eq('id', editingPost.id)
          .select()
          .single()
      : await supabase.from('posts').insert(values).select().single()

    if (result.error) {
      setError(result.error.message)
      return false
    }

    if (editingPost) {
      setPosts((currentPosts) => {
        const alreadyListed = currentPosts.some((post) => post.id === result.data.id)
        return alreadyListed
          ? currentPosts.map((post) => (post.id === result.data.id ? result.data : post))
          : [...currentPosts, result.data]
      })
    }

    setComposer(null)
    if (!editingPost) await loadPosts()
    return true
  }

  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="topbar">
          <Link className="brand" to="/" aria-label="Riftbound home">
            <img src="/assets/riftbound-header.png" alt="Riftbound" />
          </Link>
          <button className="button button-primary top-create" onClick={() => setComposer({})}>
            + New post
          </button>
        </header>

        <div className="page-layout">
          <main className="main-content">
            {error && <div className="error-banner" role="alert">{error}</div>}
            <Routes>
              <Route
                path="/"
                element={
                  <ForumHome
                    posts={posts}
                    sort={sort}
                    setSort={setSort}
                    loading={loading}
                  />
                }
              />
              <Route
                path="/posts/:postId"
                element={
                  <PostDetails
                    posts={posts}
                    onEdit={(post) => setComposer(post)}
                    onVote={handleVote}
                    onError={setError}
                    onDeleted={(postId) => setPosts((currentPosts) => currentPosts.filter((post) => post.id !== postId))}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>

        {composer && (
          <PostComposer
            post={composer.id ? composer : null}
            onClose={() => setComposer(null)}
            onSave={savePost}
          />
        )}
      </div>
    </BrowserRouter>
  )
}

function ForumHome({ posts, sort, setSort, loading }) {
  const [search, setSearch] = useState('')
  const filteredPosts = posts.filter((post) =>
    (post.title ?? '').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  )

  return (
      <section className="feed-section">
        <div className="feed-heading">
          <h1>Posts</h1>
          <div className="feed-controls">
            <label className="search-control">
              <span className="visually-hidden">Search posts by title</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search titles"
              />
            </label>
            <label className="sort-control">
              <span>Sort by</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort posts">
                <option value="created_at">Newest</option>
                <option value="upvotes">Most upvoted</option>
              </select>
            </label>
          </div>
        </div>
        <div className="post-list">
          {loading ? (
            <div className="empty-state"><span className="loader" /> Loading posts…</div>
          ) : filteredPosts.length ? (
            filteredPosts.map((post) => <PostCard key={post.id} post={post} />)
          ) : (
            <div className="empty-state">
              <p>{search.trim() ? 'No posts match that title.' : 'No posts yet.'}</p>
            </div>
          )}
        </div>
      </section>
  )
}

function PostCard({ post, onEdit, onVote, onDelete, deleting = false, detail = false }) {
  const title = post.title || 'Untitled post'
  return (
    <article className={`post-card${detail ? ' post-card-detail' : ''}`}>
      {!detail && (
        <div className="vote-count" aria-label={`${post.upvotes ?? 0} upvotes`}>
          <span>▲</span><strong>{post.upvotes ?? 0}</strong>
        </div>
      )}
      <div className="post-content">
        <div className="post-meta">
          {detail && (
            <>
              <span className="avatar">{(post.author || 'S').trim().charAt(0).toUpperCase()}</span>
              <strong>{post.author || 'Anonymous'}</strong>
              <span className="meta-dot">·</span>
            </>
          )}
          <time dateTime={post.created_at}>{formatDate(post.created_at)}</time>
          {detail && post.updated_at && new Date(post.updated_at) - new Date(post.created_at) > 60000 && <span className="edited-label">edited</span>}
        </div>
        {detail ? (
          <h1 className="post-title">{title}</h1>
        ) : (
          <Link to={`/posts/${post.id}`} className="post-title-link"><h3>{title}</h3></Link>
        )}
        {detail && post.body && <p className="post-body">{post.body}</p>}
        {detail && post.image && (
          <img
            className="post-image"
            src={post.image}
            alt=""
            onError={(event) => { event.currentTarget.hidden = true }}
          />
        )}
        {detail && (
          <div className="post-actions">
            <Link to={`/posts/${post.id}`} className="post-action"><span>▤</span> Comments</Link>
            <button className="post-action" onClick={() => onVote(post)}><span>▲</span> Upvote · {post.upvotes ?? 0}</button>
            <button className="post-action edit-action" onClick={() => onEdit(post)}><span>✎</span> Edit</button>
            <button className="post-action post-action-danger" onClick={() => onDelete(post)} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

function PostDetails({ posts, onEdit, onVote, onError, onDeleted }) {
  const { postId } = useParams()
  const navigate = useNavigate()
  const [post, setPost] = useState(null)
  const cachedPost = posts.find((item) => String(item.id) === postId)
  const displayedPost = cachedPost ?? post
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [author, setAuthor] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [commentMessage, setCommentMessage] = useState('')
  const [deleting, setDeleting] = useState(false)
  const fetchPostAndComments = useCallback(async () => {
    const [postResult, commentsResult] = await Promise.all([
      supabase.from('posts').select('*').eq('id', postId).maybeSingle(),
      supabase.from('comments').select('*').eq('parent_id', postId).order('created_at', { ascending: true }),
    ])
    return { postResult, commentsResult }
  }, [postId])

  const applyPostAndComments = useCallback((postResult, commentsResult) => {
    if (postResult.error) {
      onError(postResult.error.message)
      setPost(null)
    } else {
      setPost(postResult.data)
    }
    if (commentsResult.error) onError(commentsResult.error.message)
    else setComments(commentsResult.data ?? [])
  }, [onError])

  useEffect(() => {
    let active = true
    fetchPostAndComments().then(({ postResult, commentsResult }) => {
      if (!active) return
      applyPostAndComments(postResult, commentsResult)
      setLoading(false)
    })
    return () => { active = false }
  }, [applyPostAndComments, fetchPostAndComments])

  const submitComment = async (event) => {
    event.preventDefault()
    const commentBody = body.trim()
    if (!commentBody || sending) return

    setSending(true)
    setCommentMessage('')
    try {
      const { data, error: insertError } = await supabase
        .from('comments')
        .insert({
          parent_id: Number(postId),
          author: author.trim() || 'Anonymous',
          body: commentBody,
        })
        .select()
        .single()

      if (insertError) {
        setCommentMessage(insertError.message)
        return
      }

      setComments((currentComments) => [...currentComments, data])
      setBody('')
      setAuthor('')
    } catch (submitError) {
      setCommentMessage(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to post comment. Please try again.',
      )
    } finally {
      setSending(false)
    }
  }

  const voteOnPost = async () => {
    if (await onVote(displayedPost)) {
      setPost((currentPost) => ({ ...currentPost, upvotes: (currentPost.upvotes ?? 0) + 1 }))
    }
  }

  const deletePost = async (targetPost) => {
    if (deleting || !window.confirm('Delete this post and all of its comments? This cannot be undone.')) return

    setDeleting(true)
    const { data: deletedComments, error: commentsError } = await supabase
      .from('comments')
      .delete()
      .eq('parent_id', targetPost.id)
      .select('id')

    if (commentsError) {
      onError(commentsError.message)
      setDeleting(false)
      return
    }
    if ((deletedComments?.length ?? 0) < comments.length) {
      onError('Could not delete all comments. Check the Supabase delete policy for comments.')
      setDeleting(false)
      return
    }

    const { data, error: postError } = await supabase
      .from('posts')
      .delete()
      .eq('id', targetPost.id)
      .select('id')
      .maybeSingle()

    if (postError || !data) {
      onError(
        postError
          ? `Comments were deleted, but the post could not be deleted: ${postError.message}`
          : 'Comments were deleted, but the post was not deleted. Check the Supabase delete policy for posts.',
      )
      setDeleting(false)
      return
    }

    onDeleted(targetPost.id)
    navigate('/')
  }

  if (loading) return <div className="empty-state"><span className="loader" /> Loading post…</div>
  if (!displayedPost) return <div className="empty-state"><h3>Post not found</h3><Link to="/" className="text-link">Back to posts</Link></div>

  return (
    <div className="detail-page">
      <Link to="/" className="back-link">← Back to the board</Link>
      <PostCard post={displayedPost} detail onEdit={onEdit} onVote={voteOnPost} onDelete={deletePost} deleting={deleting} />
      <section className="comments-section">
        <div className="comments-heading">
          <h2>Comments</h2>
        </div>
        <div className="comment-list">
          {comments.length ? comments.map((comment) => (
            <article key={comment.id} className="comment-card">
              <span className="avatar">{(comment.author || 'S').trim().charAt(0).toUpperCase()}</span>
              <div>
                <div className="post-meta"><strong>{comment.author || 'Anonymous'}</strong><span className="meta-dot">·</span><time dateTime={comment.created_at}>{formatDate(comment.created_at)}</time></div>
                <p>{comment.body}</p>
              </div>
            </article>
          )) : <p className="no-comments">No comments yet.</p>}
        </div>
        <form className="comment-form" onSubmit={submitComment}>
          <div className="form-fields">
            <label className="field-label">Your name <span>optional</span><input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Name" maxLength="40" /></label>
            <label className="field-label">Comment<textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a comment…" required rows="3" maxLength="2000" /></label>
          </div>
          <button className="button button-primary" disabled={sending || !body.trim()}>{sending ? 'Posting…' : 'Post reply'} <span>→</span></button>
        </form>
        {commentMessage && <p className="comment-error" role="alert">{commentMessage}</p>}
      </section>
    </div>
  )
}

function PostComposer({ post, onClose, onSave }) {
  const [author, setAuthor] = useState(post?.author ?? '')
  const [title, setTitle] = useState(post?.title ?? '')
  const [body, setBody] = useState(post?.body ?? '')
  const [image, setImage] = useState(post?.image ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    const saved = await onSave({
      author: author.trim() || 'Anonymous',
      title: title.trim(),
      body: body.trim() || null,
      image: image.trim() || null,
      ...(!post && { upvotes: 0 }),
    }, post)
    setSaving(false)
    if (saved) onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="composer-modal" role="dialog" aria-modal="true" aria-labelledby="composer-title">
        <div className="modal-heading">
          <div><h2 id="composer-title">{post ? 'Edit post' : 'Create post'}</h2></div>
          <button className="close-button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={submit}>
          <label className="field-label">Your name <span>optional</span><input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Name" maxLength="40" /></label>
          <label className="field-label">Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Post title" required maxLength="160" /></label>
          <label className="field-label">Body <span>optional</span><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Post text (optional)" rows="5" maxLength="5000" /></label>
          <label className="field-label">Image URL <span>optional</span><input type="url" value={image} onChange={(event) => setImage(event.target.value)} placeholder="https://…" /></label>
          <div className="modal-actions"><button type="button" className="button button-text" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : post ? 'Save changes' : 'Publish post'} <span>→</span></button></div>
        </form>
      </section>
    </div>
  )
}

export default App
