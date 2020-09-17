import fs from 'fs'
import Router from '@koa/router'
import _ from 'lodash'
import { Luren, AuthenticationType, Middleware } from 'luren'
import njk from 'nunjucks'
import Path from 'path'
import { getParams, getRequestBody, getResponses, toYaml, authenticatorToSecuritySchema } from './utils'
import { Authenticator } from 'luren/dist/processors/Authenticator'
import { List, Map } from 'immutable'
import mount from 'koa-mount'

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
  example?: any
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
  description?: string
}

function isAuthenticator(middleware: Middleware): middleware is Authenticator {
  return middleware instanceof Authenticator && middleware.authenticationType !== AuthenticationType.NONE
}

export interface IOpenApi {
  openapi: string
  info: IInfo
  servers: IServer[]
  paths: { [path: string]: IPath }
  components: { schemas: any; securitySchemes?: any }
  security?: any[]
  tags?: ITag[]
  externalDocs?: any
}

export class Swagger {
  private _info: IInfo
  private _servers: IServer[]
  private _openApi!: IOpenApi
  private _path: string
  private _output?: string
  constructor(options?: { info?: IInfo; servers?: IServer[]; path?: string; output?: string }) {
    this._info = (options && options.info) || { title: 'Luren Swagger', version: '1.0.0' }
    this._servers = (options && options.servers) || [{ url: '/', description: 'localhost' }]
    this._path = (options && options.path) || '/explorer'
    this._output = options && options.output
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
          schemas: {}
        }
      }
      const router = new Router()

      router.get('/swagger.json', async (ctx) => {
        if (!this._openApi) {
          // const appModule = luren.getAppModule()
          let securitySchemes = Map<string, any>()
          const ctrlModules = luren.getAppModule().controllerModules
          for (const ctrlModule of ctrlModules) {
            const tag: ITag = { name: ctrlModule.name, description: ctrlModule.desc }
            if (openApi.tags) {
              openApi.tags.push(tag)
            } else {
              openApi.tags = [tag]
            }

            for (const actionModule of ctrlModule.actionModules) {
              const pathObj: IPath = {}
              const operation: IOperation = {
                tags: [ctrlModule.name],
                // summary: actionModule.summary,
                description: actionModule.desc,
                responses: {},
                deprecated: actionModule.deprecated
              }
              pathObj[actionModule.method.toLowerCase()] = operation
              const params = getParams(actionModule)
              if (!_.isEmpty(params)) {
                operation.parameters = params
              }
              const requestBody = getRequestBody(actionModule)
              if (!_.isEmpty(requestBody)) {
                operation.requestBody = requestBody
              }
              const responses = getResponses(actionModule)

              operation.responses = responses
              const version = actionModule.version || ctrlModule.version || ''
              let path = Path.join(ctrlModule.prefix, version, ctrlModule.path, actionModule.path)
              const reg = /:(\w+)/
              let match: any
              do {
                match = reg.exec(path)
                if (match) {
                  path = path.replace(match[0], `{${match[1]}}`)
                }
              } while (match)
              openApi.paths[path] = openApi.paths[path] || {}
              openApi.paths[path][actionModule.method.toLowerCase()] = operation
              const authenticators = actionModule.middleware.filter((item) => isAuthenticator(item)) as List<
                Authenticator
              >
              const descriptors = authenticators.map((item) => item.getDescriptor())
              if (descriptors) {
                for (const descriptor of descriptors) {
                  const securitySchema = authenticatorToSecuritySchema(descriptor)
                  if (!securitySchemes.has(descriptor.name)) {
                    securitySchemes = securitySchemes.set(descriptor.name, securitySchema)
                  }
                  if (!operation.security) {
                    operation.security = []
                  }
                  operation.security.push({ [descriptor.name]: [] })
                }
              }
            }
          }
          if (!securitySchemes.isEmpty()) {
            openApi.components.securitySchemes = {}
            for (const [name, securitySchema] of securitySchemes.entries()) {
              openApi.components.securitySchemes[name] = securitySchema
            }
          }

          this._openApi = openApi
        }
        if (this._output) {
          const file = Path.resolve(this._output, `swagger-v${this._openApi.info.version}.yml`)
          fs.writeFile(file, Buffer.from(toYaml(this._openApi)), (err) => {
            if (err) {
              // tslint:disable-next-line: no-console
              console.error(err)
            }
          })
        }
        ctx.body = this._openApi
      })
      router.get('/', async (ctx) => {
        ctx.body = njk.render(Path.resolve(__dirname, '../swagger-dist/index.html'), {
          swaggerJsonPath: 'swagger.json',
          assetPrefix: 'assets'
        })
      })
      luren.use(mount(this._path, router.routes() as any))
      luren.serve(Path.join(this._path, 'assets'), { root: Path.resolve(__dirname, '../swagger-dist') })
    }
  }
}
