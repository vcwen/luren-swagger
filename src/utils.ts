import _ from 'lodash'
import { HttpStatusCode, AuthenticationType, IAuthenticatorDescriptor, ActionModule } from 'luren'
import { JsTypes } from 'luren-schema'
import { IMediaType, IParameter, IRequestBody, IResponse } from './swagger'
// tslint:disable-next-line: no-var-requires
const toOpenApiSchema = require('json-schema-to-openapi-schema')

// tslint:disable-next-line: no-var-requires
const yaml = require('json-to-pretty-yaml')

export const getParams = (actionModule: ActionModule) => {
  const paramInfos = actionModule.params
  if (paramInfos.isEmpty()) {
    return []
  }
  let params: IParameter[] = []
  for (const paramInfo of paramInfos) {
    if (paramInfo.source === 'context' || paramInfo.source === 'body') {
      continue
    }
    if (paramInfo.root) {
      params = []
      if (paramInfo.schema.properties) {
        const props = Object.getOwnPropertyNames(paramInfo.schema.properties)
        const requiredProps = paramInfo.schema.required || []
        for (const prop of props) {
          const propSchema = JsTypes.toJsonSchema(paramInfo.schema.properties[prop])
          const param: IParameter = {
            name: prop,
            in: paramInfo.source,
            required: requiredProps.includes(prop),
            schema: toOpenApiSchema(propSchema),
            description: paramInfo.desc
          }
          if (paramInfo.example) {
            param.example = paramInfo.example
          }
          params.push(param)
        }
        if (actionModule.targetFunction === 'findOne') {
          console.log(params)
        }
        return params
      } else {
        throw new TypeError("Parameter's type must be 'object' when it's root")
      }
    } else {
      const schema = toOpenApiSchema(JsTypes.toJsonSchema(paramInfo.schema))
      const param: IParameter = {
        name: paramInfo.name,
        in: paramInfo.source,
        required: paramInfo.required,
        schema,
        description: paramInfo.desc
      }
      if (paramInfo.example) {
        param.example = paramInfo.example
      }
      params.push(param)
    }
  }
  return params
}

export const getRequestBody = (actionModule: ActionModule) => {
  const paramInfos = actionModule.params
  if (!paramInfos) {
    return {} as any
  }
  const body: IRequestBody = { content: {} }
  let content = 'application/json'
  let schema: any = { type: 'object', properties: {}, required: [] }
  const bodyParamInfos = paramInfos.filter((info) => info.source === 'body')
  if (!bodyParamInfos.isEmpty()) {
    let bodyDesc: string[] = []
    for (const paramInfo of bodyParamInfos) {
      if (paramInfo.source === 'body') {
        if (paramInfo.schema.type === 'file') {
          if (paramInfo.root) {
            content = paramInfo.mime || 'application/octet-stream'
          } else {
            content = 'multipart/form-data'
          }
        }
        if (paramInfo.root) {
          schema = JsTypes.toJsonSchema(paramInfo.schema)
          if (paramInfo.example) {
            schema.example = paramInfo.example
          }
          if (paramInfo.desc) {
            bodyDesc = [paramInfo.desc]
          }
          break
        } else {
          if (paramInfo.required) {
            schema.required.push(paramInfo.name)
          }
          schema.properties[paramInfo.name] = JsTypes.toJsonSchema(paramInfo.schema)
          if (paramInfo.example) {
            schema.properties[paramInfo.name].example = paramInfo.example
          }
          if (paramInfo.desc) {
            bodyDesc.push(`<strong>${paramInfo.name}</strong>: ${paramInfo.desc}`)
          }
        }
      }
    }
    body.content = { [content]: { schema: toOpenApiSchema(schema) } }
    body.description = bodyDesc.join('<br/>')
    return body
  }
}

const normalizeResponseSchema = (schema: any): any => {
  if (schema.jsonType) {
    schema.type = schema.jsonType
  } else {
    if (schema.type === 'object') {
      if (!_.isEmpty(schema.properties)) {
        const props = Object.getOwnPropertyNames(schema.properties)
        for (const prop of props) {
          const propSchema = schema.properties[prop]
          normalizeResponseSchema(propSchema)
          if (propSchema.name) {
            Reflect.set(schema.properties, propSchema.name, propSchema)
            Reflect.deleteProperty(schema.properties, prop)
          }
        }
      }
    } else if (schema.type === 'array' && !_.isEmpty(schema.items)) {
      normalizeResponseSchema(schema.items)
    }
  }
  return schema
}

export const getResponses = (actionModule: ActionModule) => {
  const responseInfos = actionModule.responses
  const responses: { [code: string]: IResponse } = {}
  if (responseInfos) {
    for (const [statusCode, resInfo] of responseInfos) {
      const response: IResponse = {} as any
      const res: IMediaType = {} as any
      const contentType =
        resInfo.headers && resInfo.headers['Content-Type'] ? resInfo.headers['Content-Type'] : 'application/json'
      const schema = JsTypes.toJsonSchema(resInfo.schema)
      res.schema = toOpenApiSchema(schema)
      if (resInfo.example) {
        res.example = resInfo.example
      }
      response.description = resInfo.desc
      response.content = { [contentType]: res }
      responses[statusCode] = response
    }
  } else {
    responses[HttpStatusCode.OK] = { description: 'successful operation' }
  }

  return responses
}

export const authenticatorToSecuritySchema = (
  authDescriptor: IAuthenticatorDescriptor & { [key: string]: any }
): any => {
  switch (authDescriptor.authenticationType) {
    case AuthenticationType.API_TOKEN: {
      return { id: authDescriptor.name, type: 'apiKey', name: authDescriptor.key, in: authDescriptor.source }
    }

    case AuthenticationType.HTTP: {
      return {
        type: 'http',
        id: authDescriptor.id,
        scheme: authDescriptor.scheme,
        bearerFormat: authDescriptor.format
      }
    }
    default:
      return undefined
  }
}

const stripUndefined = (data: any) => {
  if (data === undefined) {
    return null
  }
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      if (data[i] === undefined) {
        data[i] = null
      } else {
        stripUndefined(data[i])
      }
    }
    return data
  } else if (typeof data === 'object') {
    const props = Object.getOwnPropertyNames(data)
    for (const prop of props) {
      if (data[prop] === undefined) {
        Reflect.deleteProperty(data, prop)
      }
    }
    return data
  } else {
    return data
  }
}

export const toYaml = (data: any) => {
  stripUndefined(data)
  return yaml.stringify(data, { maxDepth: 20, noColor: true })
}
