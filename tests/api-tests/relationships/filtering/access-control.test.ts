import { gen, sampleOne } from 'testcheck'
import { text, relationship } from '@keystone-6/core/fields'
import { list } from '@keystone-6/core'
import { setupTestRunner } from '@keystone-6/api-tests/test-runner'
import { allowAll } from '@keystone-6/core/access'

const alphanumGenerator = gen.alphaNumString.notEmpty()

const postNames = ['Post 1', 'Post 2', 'Post 3']

const runner = setupTestRunner({
  config: {
    lists: {
      UserToPostLimitedRead: list({
        access: {
          operation: allowAll,
          filter: {
            query: () => ({ username: { not: { equals: 'bad' } } }),
          },
        },
        fields: {
          username: text(),
          posts: relationship({ ref: 'PostLimitedRead.author', many: true }),
        },
      }),
      PostLimitedRead: list({
        access: {
          operation: allowAll,
          filter: {
            // Limit read access to the first post only
            query: () => ({ name: { in: [postNames[1]] } }),
          },
        },
        fields: {
          name: text(),
          content: text(),
          author: relationship({ ref: 'UserToPostLimitedRead.posts', many: false }),
        },
      }),
    },
  },
})

describe('relationship filtering with access control', () => {
  test(
    'implicitly filters to only the IDs in the database by default',
    runner(async ({ context }) => {
      // Create all of the posts with the given IDs & random content
      const posts = await Promise.all(
        postNames.map(name => {
          const postContent = sampleOne(alphanumGenerator)
          return context.sudo().query.PostLimitedRead.createOne({
            data: { content: postContent, name },
          })
        })
      )
      const postIds = posts.map(({ id }) => id)
      // Create a user that owns 2 posts which are different from the one
      // specified in the read access control filter
      const username = sampleOne(alphanumGenerator)
      const user = await context.sudo().query.UserToPostLimitedRead.createOne({
        data: {
          username,
          posts: { connect: [{ id: postIds[1] }, { id: postIds[2] }] },
        },
      })

      // Create an item that does the linking
      const item = await context.query.UserToPostLimitedRead.findOne({
        where: { id: user.id },
        query: 'id username posts { id author { id username } }',
      })

      expect(item).toMatchObject({
        id: expect.any(String),
        username,
        posts: [{ id: postIds[1], author: { id: user.id, username } }],
      })
    })
  )

  test(
    'explicitly filters when given a `where` clause',
    runner(async ({ context }) => {
      // Create all of the posts with the given IDs & random content
      const posts = await Promise.all(
        postNames.map(name => {
          const postContent = sampleOne(alphanumGenerator)
          return context.sudo().query.PostLimitedRead.createOne({
            data: { content: postContent, name },
          })
        })
      )
      const postIds = posts.map(({ id }) => id)
      // Create a user that owns 2 posts which are different from the one
      // specified in the read access control filter
      const username = sampleOne(alphanumGenerator)
      const user = await context.sudo().query.UserToPostLimitedRead.createOne({
        data: {
          username,
          posts: { connect: [{ id: postIds[1] }, { id: postIds[2] }] },
        },
      })

      // Create an item that does the linking
      const item = await context.query.UserToPostLimitedRead.findOne({
        where: { id: user.id },
        // Knowingly filter to an ID I don't have read access to
        // to see if the filter is correctly "AND"d with the access control
        query: `id username posts(where: { id: { in: ["${postIds[2]}"] } }) { id }`,
      })

      expect(item).toMatchObject({ id: expect.any(String), username, posts: [] })
    })
  )
})
