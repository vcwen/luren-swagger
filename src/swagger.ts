import { Map } from 'immutable'
import mount from 'koa-mount'
import Router from 'koa-router'
import serve from 'koa-static'
import _ from 'lodash'
import { CtrlMetadata, Luren, MetadataKey, RouteMetadata } from 'luren'
import njk from 'nunjucks'
import Path from 'path'
import Url from 'url'
import { getParams, getRequestBody, getResponses } from './utils'

export interface IContact {
  name: string
  url: string
  email: string
}
export interface ILicense {
  name: string
  url?: string
}
export interface IInfo {
  title: string
  version: string
  description?: string
  termsOfService?: string
  contact?: IContact
  license?: ILicense
}

export interface IServer {
  url: string
  description?: string
  variables?: any
}

export interface IParameter {
  name: string
  in: string
  schema?: any
  description?: string
  required?: boolean
  deprecated?: boolean
}

export interface IMediaType {
  schema: any
  example?: any
  examples?: any[]
  encoding?: any
}

export interface IRequestBody {
  description?: string
  content: { [mediaType: string]: IMediaType }
  required?: boolean
}

export interface IResponse {
  description?: string
  headers?: any
  content: { [content: string]: IMediaType }
}

export interface IOperation {
  tags?: string[]
  summary?: string
  description?: string
  externalDocs?: any
  operationId?: string
  parameters?: IParameter[]
  requestBody?: IRequestBody
  responses: { [code: string]: IResponse }
  callbacks?: any
  deprecated?: boolean
  security?: any[]
  servers?: IServer[]
}

export interface IPath {
  get?: IOperation
  post?: IOperation
  put?: IOperation
  delete?: any
  summary?: string
  description?: string
}

export interface ITag {
  name: string
  description?: []
}

export interface IOpenApi {
  openapi: string
  info: IInfo
  servers: IServer[]
  paths: { [path: string]: IPath }
  components?: any
  security?: any[]
  tags?: ITag[]
  externalDocs?: any
}

export class Swagger {
  private _info: IInfo
  private _servers: IServer[]
  private _openApi: any
  private _path: string
  constructor(options?: { info?: IInfo; servers?: IServer[]; path?: string }) {
    this._info = (options && options.info) || { title: 'Luren Swagger', version: '1.0.0' }
    this._servers = (options && options.servers) || [{ url: '/' }]
    this._path = (options && options.path) || '/explorer'
  }
  public pluginify() {
    return (luren: Luren) => {
      const koa = luren.getKoa()
      const openApi: IOpenApi = {
        openapi: '3.0.0',
        info: this._info,
        servers: this._servers,
        tags: [],
        paths: {}
      }
      const router = new Router()
      router.get('/explorer/swagger.json', async (ctx) => {
        if (!this._openApi) {
          const controllers = luren.getControllers()
          for (const ctrl of controllers) {
            const ctrlMetadata: CtrlMetadata = Reflect.getMetadata(MetadataKey.CONTROLLER, ctrl)
            const tag: ITag = { name: ctrlMetadata.name }
            if (openApi.tags) {
              openApi.tags.push(tag)
            } else {
              openApi.tags = [tag]
            }
            const routeMetadataMap: Map<string, RouteMetadata> = Reflect.getMetadata(MetadataKey.ROUTES, ctrl) || Map()
            for (const [prop, routeMetadata] of routeMetadataMap) {
              const pathObj: IPath = {}
              pathObj[routeMetadata.method] = {
                tags: [ctrlMetadata.name],
                description: routeMetadata.desc,
                responses: {},
                deprecated: routeMetadata.deprecated
              }
              const operation: IOperation = pathObj[routeMetadata.method]
              const params = getParams(ctrl, prop)
              if (!_.isEmpty(params)) {
                operation.parameters = params
              }
              const requestBody = getRequestBody(ctrl, prop)
              if (!_.isEmpty(requestBody)) {
                operation.requestBody = requestBody
              }
              const responses = getResponses(ctrl, prop)
              operation.responses = responses
              const path = Path.join(luren.getPrefix(), routeMetadata.path)
              openApi.paths[path] = openApi.paths[path] || {}
              openApi.paths[path][routeMetadata.method.toLowerCase()] = operation
            }
          }
          this._openApi = openApi
        }
        ctx.body = this._openApi
      })
      router.get(this._path, async (ctx) => {
        ctx.body = njk.render(Path.resolve(__dirname, '../swagger-dist/index.html'), {
          url: Url.resolve(ctx.href, Path.join(ctx.path, 'swagger.json')),
          prefix: Path.join(ctx.path, 'assets')
        })
      })
      koa.use(router.routes()).use(router.allowedMethods())
      koa.use(mount(Path.join(this._path, 'assets'), serve(Path.resolve(__dirname, '../swagger-dist'))))
    }
  }
}
