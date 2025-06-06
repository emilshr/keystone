import { list, group, gWithContext } from '@keystone-6/core'
import { allowAll } from '@keystone-6/core/access'
import { text, relationship, virtual } from '@keystone-6/core/fields'
import type { Lists, Context } from '.keystone/types'

const ifUnsetHideUI = {
  itemView: {
    fieldMode: ({ itemField }: { itemField: unknown | null }) => (itemField ? 'edit' : 'read'),
  },
  listView: {
    fieldMode: 'hidden',
  },
} as const

const g = gWithContext<Context>()
type g<T> = gWithContext.infer<T>

export const lists: Lists = {
  Post: list({
    access: allowAll,
    fields: {
      title: text(),
      content: text(),
    },
  }),

  Link: list({
    access: allowAll,
    fields: {
      title: text(),
      url: text(),
    },
  }),

  // an unoptimised union relationship list type, each item represents only a Post, or a Link
  Media: list({
    access: allowAll,
    graphql: {
      plural: 'Medias',
    },
    fields: {
      label: virtual({
        field: g.field({
          type: g.String,
          resolve: async (item, _, context) => {
            const { postId, linkId } = item
            if (postId) {
              return (
                (await context.db.Post.findOne({ where: { id: postId } }))?.title ?? '[missing]'
              )
            }
            if (linkId) {
              return (
                (await context.db.Link.findOne({ where: { id: linkId } }))?.title ?? '[missing]'
              )
            }
            return '?'
          },
        }),
      }),
      description: text(),

      ...group({
        label: 'Media Type',
        fields: {
          post: relationship({
            ref: 'Post',
            ui: {
              ...ifUnsetHideUI,
            },
          }),

          link: relationship({
            ref: 'Link',
            ui: {
              ...ifUnsetHideUI,
            },
          }),
        },
      }),
    },

    hooks: {
      validate: {
        create: async ({ inputData, addValidationError }) => {
          const { post, link } = inputData
          const values = [post, link].filter(x => x?.connect ?? x?.create)
          if (values.length === 0)
            return addValidationError('A media type relationship is required')
          if (values.length > 1)
            return addValidationError('Only one media type relationship can be selected')
        },
        update: async ({ inputData, addValidationError }) => {
          const { post, link } = inputData
          if ([post, link].some(x => x?.disconnect))
            return addValidationError('Cannot change media type relationship type')

          const values = [post, link].filter(x => x?.connect ?? x?.create)
          if (values.length > 1)
            return addValidationError('Only one media type relationship can be selected')

          // TODO: prevent item from changing types with implicit disconnect
        },
      },
      resolveInput: {
        update: async ({ resolvedData }) => {
          const { post, link, ...rest } = resolvedData
          for (const [key, value] of Object.entries({ post, link })) {
            if (!value) continue
            if (value.disconnect) continue // TODO: null should disconnect

            // disconnect everything else
            return {
              ...rest,
              post: { disconnect: true },
              link: { disconnect: true },
              [key]: value,
            }
          }

          return rest
        },
      },
    },
  }),
} satisfies Lists
