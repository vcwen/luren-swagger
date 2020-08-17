import { Controller, Action, Response, Luren, InQuery, HttpMethod, InPath, Param, InBody } from 'luren'
import { Swagger } from './swagger'

@Controller({ prefix: '/broadcast/api' })
class Article {
  @Action({ path: '/articleLists' })
  @Response({
    type: {
      title: 'string',
      thumbMediaId: 'string',
      showCoverImage: 'boolean',
      author: 'string?',
      digest: 'string?',
      content: 'string',
      url: 'string',
      thumbUrl: 'string',
      commentEnabled: 'boolean',
      onlyFansFanComment: 'boolean',
      sourceUrl: 'string?',
      isImported: 'boolean'
    }
  })
  public getArticleLists(
    @InQuery('appId', true) appId: string,
    @Param({ name: 'search', required: false, desc: 'keyword used to search in article title and digest' })
    search: string
  ) {
    console.log(appId, search)
  }
  @Action({ method: HttpMethod.POST })
  @Response({ type: 'string' })
  public sync(@InBody('appId') appId: string) {
    console.log(appId)
    return 'SUCCESS'
  }
  @Action({ method: HttpMethod.POST, path: '/articleLists/:id/alter' })
  @Response({ type: 'string' })
  public alterArticleList(
    @InPath(':id') articleListId: string,
    @Param({
      name: 'sequence',
      in: 'body',
      type: ['number'],
      desc: 'new articles sequence, if article index is not present in the sequence, then the article will be removed',
      example: [1, 3, 2]
    })
    seq: number[]
  ) {
    console.log(articleListId)
    console.log(seq)
    return 'SUCCESS'
  }
}

const server = new Luren()
server.register(Article)
const swagger = new Swagger()
server.plugin(swagger.pluginify())

server.listen(3000)
