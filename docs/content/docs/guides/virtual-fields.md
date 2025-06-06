---
title: "Virtual Fields"
description: "Learn how to extend your GraphQL API in powerful ways with the Virtual Fields feature."
---

Keystone lets you define your data model in terms of `lists`, which have `fields`.
Most lists will have some [scalar fields](../fields/overview#scalar-types), such as `text` and `integer` fields, which are stored in your database.

It can also be helpful to have read-only fields which are computed on the fly when you query them.
Keystone lets you do this with the [`virtual`](../fields/virtual) field type.

Virtual fields provide a powerful way to extend your GraphQL API.
In this guide we'll introduce the syntax for adding virtual fields, and show how to build up from a simple to a complex example.

## Hello world

We'll start with a list called `Example` and create a virtual field called `hello`.

```typescript
import { config, createSchema, graphql, list } from '@keystone-6/core';
import { virtual } from '@keystone-6/core/fields';

export default config({
  lists: {
    Example: list({
      fields: {
        hello: virtual({
          field: graphql.field({
            type: graphql.String,
            resolve() {
              return "Hello, world!";
            },
          }),
        }),
      },
    }),
  },
});
```

We can now run a GraphQL query and request the `hello` field on one of our `Example` items,

```graphql
{
  example(where: { id: "1" }) {
    id
    hello
  }
}
```

which gives the response:

```javascript
{ example: { id: "1", hello: "Hello, world! } }
```

The value of `hello` is generated from the `resolve` function, which returns the string `"Hello, world!"`.

## The `graphql` API

The `virtual` field is configured using functions from the `graphql` export from `@keystone-6/core`.
This API provides the interface required to create type-safe extensions to the Keystone GraphQL schema.
The `graphql` API is based on the [`@graphql-ts/schema`](https://github.com/Thinkmill/graphql-ts) package.

The `virtual` field accepts a configuration option called `field`, which is a `graphql.field()` object.

In our example we passed in two required options to `graphql.field()`.
The option `type: graphql.String` specifies the GraphQL type of our virtual field, and `resolve() { ... }` defines the [GraphQL resolver](https://graphql.org/learn/execution/#root-fields-resolvers) to be executed when this field is queried.

The `graphql` API provides support for the built in GraphQL scalar types `Int`, `Float`, `String`, `Boolean`, and `ID`, as well as the Keystone custom scalars `Upload` and `JSON`.

## Resolver arguments

The `resolve` function accepts arguments which let you write more sophisticated virtual fields.
The arguments are `(item, args, context, info)`.
The `item` argument is the **internal item** representing the list item being queried.
The `args` argument represents the arguments passed to the field itself in the query.
The `context` argument is a [`KeystoneContext`](../context/overview) object.
The `info` argument holds field-specific information relevant to the current query as well as the schema details.

We can use the `item` and `context` arguments to query data in our Keystone system.
For example, if we have a blog with `Author` and `Post` lists, it might be convenient to have an `authorName` field on the `Post` list.
We can do this with a `virtual` field which queries for the related `author` and returns their name.

```typescript
export default config({
  lists: {
    Post: list({
      fields: {
        content: text(),
        author: relationship({ ref: 'Author', many: false }),
        authorName: virtual({
          field: graphql.field({
            type: graphql.String,
            async resolve(item, args, context) {
              const { author } = await context.query.Post.findOne({
                where: { id: item.id.toString() },
                query: 'author { name }',
              });
              return author && author.name;
            },
          }),
        }),
      },
    }),
    Author: list({
      fields: {
        name: text({ validation: { isRequired: true } }),
      },
    }),
  },
});
```

## GraphQL arguments

Continuing with our blog example, we may want to extract an excerpt of each blog post for display on the home page.
We could query the full `Post.content` field for each post and then slice it in the client, but it would be nicer if we could ask for just the slice that we want from the GraphQL API.

To do this we can use a `virtual` field which takes a `length` argument and then performs the `.slice()` operation as part of resolver function.
This gives control of the size of the excerpt to the frontend while getting the backend to do the actual work.
We use the `args` option to define the GraphQL field arguments we want to support.

```typescript
export default config({
  lists: {
    Post: list({
      fields: {
        content: text(),
        excerpt: virtual({
          field: graphql.field({
            type: graphql.String,
            args: {
              length: graphql.arg({
                type: graphql.nonNull(graphql.Int),
                defaultValue: 200
              }),
            },
            resolve(item, { length }) {
              if (!item.content) {
                return null;
              }
              const content = item.content as string;
              if (content.length <= length) {
                return content;
              } else {
                return content.slice(0, length - 3) + '...';
              }
            },
          }),
          ui: { query: '(length: 500)' },
        }),
      },
    }),
  },
});
```

This will generate the following GraphQL type:

```graphql
type Post {
  id: ID!
  content: String
  excerpt(length: Int! = 200): String
}
```

We can now perform the following query to get all the excerpts without over-fetching on the client.

```graphql
{
  posts {
    id
    excerpt(length: 100)
  }
}
```

As well as passing in the `field` definition, we have also passed in `ui: { query: '(length: 500)' }`.
This is the value used when displaying the field in the Admin UI, where we want to have a different length the default of `200`.
Had we not specified `defaultValue` in our field, the `ui.query` argument would be **required**, as the Admin UI would not be able to query this field without it.

## GraphQL objects

The examples above returned a scalar `String` value. Virtual fields can also be configured to return a GraphQL object.

In our blog example we might want to provide some statistics on each blog post, such as the number of words, sentences, and paragraphs in the post.
We can set up a GraphQL type called `PostCounts` to represent this data using the `graphql.object()` function.

```typescript
export default config({
  lists: {
    Post: list({
      fields: {
        content: text(),
        counts: virtual({
          field: graphql.field({
            type: graphql.object<{
              words: number;
              sentences: number;
              paragraphs: number;
            }>()({
              name: 'PostCounts',
              fields: {
                words: graphql.field({ type: graphql.Int }),
                sentences: graphql.field({ type: graphql.Int }),
                paragraphs: graphql.field({ type: graphql.Int }),
              },
            }),
            resolve(item: any) {
              const content = item.content || '';
              return {
                words: content.split(' ').length,
                sentences: content.split('.').length,
                paragraphs: content.split('\n\n').length,
              };
            },
          }),
          ui: { query: '{ words sentences paragraphs }' },
        }),
      },
    }),
  },
});
```

This example is written in TypeScript, so we need to specify the type expected by the `PostCounts` type.
This type must correspond to the return type of the `resolve` function.

Because our `virtual` field has an object type, we also need to provide a value for the option `ui.query`.
This fragment tells the Keystone Admin UI which values to show in the item page for this field.

#### Self-referencing objects

{% hint kind="tip" %}
This information is specifically for TypeScript users of the `graphql.object()` function with a self-referential GraphQL type.
{% /hint %}

GraphQL types will often contain references to themselves and to make TypeScript allow that, you need have an explicit type annotation of `graphql.ObjectType<Source>` along with making `fields` a function that returns the object.

```ts
type PersonSource = { name: string; friends: PersonSource[] };

const Person: graphql.ObjectType<PersonSource> = graphql.object<PersonSource>()({
  name: "Person",
  fields: () => ({
    name: graphql.field({ type: graphql.String }),
    friends: graphql.field({ type: graphql.list(Person) }),
  }),
});
```

## Keystone types

Rather than returning a custom GraphQL object, we might want to have a virtual field which returns one of the GraphQL types generated by Keystone itself.
For example, for each `Author` we might want to return their `latestPost` as a `Post` object.

To achieve this, rather than passing in `graphql.field({ ... })` as the `field` option, we pass in a function `lists => graphql.field({ ... })`.
The argument `lists` contains the type information for all of the Keystone lists.
In our case, we want the output type of the `Post` list, so we specify `type: lists.Post.types.output`.

```ts
export const lists = {
  Post: list({
    fields: {
      title: text(),
      content: text(),
      publishDate: timestamp(),
      author: relationship({ ref: 'Author.posts', many: false }),
    },
  }),
  Author: list({
    fields: {
      name: text({ validation: { isRequired: true } }),
      email: text({ isIndexed: 'unique', validation: { isRequired: true } }),
      posts: relationship({ ref: 'Post.author', many: true }),
      latestPost: virtual({
        field: lists =>
          graphql.field({
            type: lists.Post.types.output,
            async resolve(item, args, context) {
              const { posts } = await context.query.Author.findOne({
                where: { id: item.id.toString() },
                query: `posts(
                    orderBy: { publishDate: desc }
                    take: 1
                  ) { id }`,
              });
              if (posts.length > 0) {
                return context.db.Post.findOne({
                  where: { id: posts[0].id }
                });
              }
            },
          }),
        ui: { query: '{ title publishDate }' },
      }),
    },
  }),
};
```

Once again we need to specify `ui.query` on this virtual field to specify which fields of the `Post` to display in the Admin UI.

## Working with virtual fields

Virtual fields provide a powerful way to extend your GraphQL API, however there are some considerations to keep in mind when using them.

The virtual field executes its resolver every time the field is requested.
For trivial calculations this isn't a problem, but for more complex calculations this can lead to performance issues.
In this case you can consider memoising the value to avoid recalculating it for each query.
Another way to address this is to use a [scalar field](../fields/overview#scalar-types) and to populate its value each time the item is updated using a [hook](./hooks).

The other main consideration is that it is not possible to filter on a virtual field, as each item calcutes its value dynamically, rather than having it stored in the database.
Using a pre-calculated scalar field is the best solution to use if you need filtering for your field.

## Related resources

{% related-content %}
{% well
heading="Virtual fields example"
href="https://github.com/keystonejs/keystone/tree/main/examples/virtual-field"
target="_blank" %}
A demo project that shows you how to add virtual fields to a Keystone list.
{% /well %}
{% well
heading="Virtual Fields: API Reference"
href="/docs/fields/virtual" %}
A virtual field represents a value which is computed a read time, rather than stored in the database.
{% /well %}
{% /related-content %}
