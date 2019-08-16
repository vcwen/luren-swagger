import { Map } from 'immutable'
import Router from 'koa-router'
import _ from 'lodash'
import { ActionMetadata, AuthenticationType, CtrlMetadata, Luren, MetadataKey } from 'luren'
import AuthenticationProcessor from 'luren/dist/lib/Authentication'
import njk from 'nunjucks'
import Path from 'path'
import { authenticationProcessorToSecuritySchema, getParams, getRequestBody, getResponses } from './utils'

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
  content?: { [content: string]: IMediaType }
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
  [other: string]: any
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
  components: { schemas: any; securitySchemes: any }
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
      const openApi: IOpenApi = {
        openapi: '3.0.0',
        info: this._info,
        servers: this._servers,
        tags: [],
        paths: {},
        components: {
          schemas: {},
          securitySchemes: {}
        }
      }
      const router = new Router()
      router.get('/swagger.json', async (ctx) => {
        if (!this._openApi) {
          let securitySchemes = Map<string, any>()
          const controllers = luren.getControllers()
          for (const ctrl of controllers) {
            const ctrlMetadata: CtrlMetadata = Reflect.getMetadata(MetadataKey.CONTROLLER, ctrl)
            const tag: ITag = { name: ctrlMetadata.name }
            if (openApi.tags) {
              openApi.tags.push(tag)
            } else {
              openApi.tags = [tag]
            }
            const actionMetadataMap: Map<string, ActionMetadata> =
              Reflect.getMetadata(MetadataKey.ACTIONS, ctrl) || Map()
            for (const [prop, actionMetadata] of actionMetadataMap) {
              const pathObj: IPath = {}
              pathObj[actionMetadata.method.toLowerCase()] = {
                tags: [ctrlMetadata.name],
                description: actionMetadata.desc,
                responses: {},
                deprecated: actionMetadata.deprecated
              }
              const operation: IOperation = pathObj[actionMetadata.method.toLowerCase()]
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
              const version = actionMetadata.version || ctrlMetadata.version || ''
              let path = Path.join(
                luren.getPrefix(),
                ctrlMetadata.prefix,
                version,
                ctrlMetadata.path,
                actionMetadata.path
              )
              const reg = /:(\w+)/
              let match: any
              do {
                match = reg.exec(path)
                if (match) {
                  path = path.replace(match[0], `{${match[1]}}`)
                }
              } while (match)
              openApi.paths[path] = openApi.paths[path] || {}
              openApi.paths[path][actionMetadata.method.toLowerCase()] = operation
              const authProcessor: AuthenticationProcessor | undefined =
                Reflect.getMetadata(MetadataKey.AUTHENTICATION, ctrl, prop) ||
                Reflect.getMetadata(MetadataKey.AUTHENTICATION, ctrl) ||
                luren.getSecuritySettings().authentication
              if (authProcessor && authProcessor.type !== AuthenticationType.NONE) {
                const securitySchema = authenticationProcessorToSecuritySchema(authProcessor)
                const entry = securitySchemes.findEntry((val) => _.isEqual(val, securitySchema))
                if (entry) {
                  operation.security = [{ [entry[0]]: [] }]
                } else {
                  securitySchemes = securitySchemes.set(authProcessor.name, securitySchema)
                  operation.security = [{ [authProcessor.name]: [] }]
                }
              }
            }
          }
          for (const [name, securitySchema] of securitySchemes.entries()) {
            if (securitySchema) {
              openApi.components.securitySchemes[name] = securitySchema
            }
          }

          this._openApi = openApi
        }
        ctx.body = this._openApi
      })
      router.get('/', async (ctx) => {
        ctx.body = njk.render(Path.resolve(__dirname, '../swagger-dist/index.html'), {
          swaggerJsonPath: 'swagger.json',
          assetPrefix: 'assets'
        })
      })
      luren.use(this._path, router.routes() as any)
      luren.serve(Path.join(this._path, 'assets'), { root: Path.resolve(__dirname, '../swagger-dist') })
    }
  }
}
